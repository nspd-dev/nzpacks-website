# app.py
from flask import Flask, redirect, request, jsonify, session, url_for
from requests.exceptions import RequestException
import os
import requests
import firebase_admin
from firebase_admin import credentials, auth
from dotenv import load_dotenv
import json # Import json module

# Load environment variables from .env file for local development
load_dotenv()

app = Flask(__name__)
# Flask secret key for session management. MUST be a strong, random value.
# For production, ensure this is set securely as an environment variable.
app.secret_key = os.getenv("FLASK_SECRET_KEY", "a_very_insecure_default_secret_key_change_this_in_production")

# --- Discord OAuth2 Configuration ---
# These values should be set as environment variables in production.
# For local development, they are loaded from your .env file.
DISCORD_CLIENT_ID = os.getenv("DISCORD_CLIENT_ID")
DISCORD_CLIENT_SECRET = os.getenv("DISCORD_CLIENT_SECRET")

# IMPORTANT: This REDIRECT_URI must be registered in your Discord Developer Application settings.
# For local development, it's typically http://localhost:5000/callback
# For deployment, it MUST be your deployed backend URL + /callback
DISCORD_REDIRECT_URI = os.getenv("DISCORD_REDIRECT_URI", "https://scenepacks-652656771624.us-central1.run.app/callback") # Updated for deployment

DISCORD_API_BASE_URL = "https://discord.com/api/v10"

# --- Firebase Admin SDK Initialization ---
try:
    # Attempt to load Firebase service account key from an environment variable.
    # This is the most secure way for production deployments (e.g., on Cloud Run).
    firebase_service_account_json = os.getenv("FIREBASE_SERVICE_ACCOUNT_KEY")
    if firebase_service_account_json:
        # Parse the JSON string into a Python dictionary
        service_account_info = json.loads(firebase_service_account_json)
        cred = credentials.Certificate(service_account_info)
    else:
        # Fallback for local development if you prefer a file (less secure for production).
        # Make sure 'serviceAccountKey.json' is in your project root or specified path.
        print("WARNING: FIREBASE_SERVICE_ACCOUNT_KEY environment variable not set. Attempting to load from serviceAccountKey.json.")
        cred = credentials.Certificate("serviceAccountKey.json")
    firebase_admin.initialize_app(cred)
    print("Firebase Admin SDK initialized successfully.")
except Exception as e:
    print(f"CRITICAL ERROR: Failed to initialize Firebase Admin SDK: {e}")
    print("Please ensure FIREBASE_SERVICE_ACCOUNT_KEY environment variable is set or serviceAccountKey.json exists and is valid.")
    # In a production app, you might want to prevent the app from starting if Firebase fails to initialize.

# --- Configuration for the required Discord role ---
# These IDs are specific to your Discord server and role.
REQUIRED_GUILD_ID = os.getenv("DISCORD_GUILD_ID") # The ID of your Discord server
REQUIRED_ROLE_ID = "1381230703504527471" # The specific role ID for dashboard access (from your .env)
DISCORD_BOT_TOKEN = os.getenv('DISCORD_BOT_TOKEN') # Your bot token to check roles

@app.route("/")
def index():
    """Simple health check endpoint for the backend."""
    return "Backend is running. Navigate to /login/discord to start OAuth."

@app.route("/login/discord")
def discord_login():
    """Redirects the user to Discord's OAuth2 authorization page."""
    # 'identify' scope: allows us to get user's Discord ID, username, avatar.
    # 'guilds' scope: allows us to get a list of guilds the user is in.
    # Note: To check specific roles within a guild, we need the bot token and GUILD_MEMBERS_INTENT.
    scope = "identify guilds"
    return redirect(f"{DISCORD_API_BASE_URL}/oauth2/authorize?client_id={DISCORD_CLIENT_ID}&redirect_uri={DISCORD_REDIRECT_URI}&response_type=code&scope={scope}")

@app.route("/callback")
def discord_callback():
    """Handles the Discord OAuth2 callback, exchanges code for token, fetches user info,
    verifies role, creates Firebase custom token, and redirects to frontend."""
    code = request.args.get("code")
    if not code:
        # If no code is provided, something went wrong with Discord's redirect
        return redirect(url_for("frontend_redirect", status="error_no_code"))

    # Exchange authorization code for access token
    data = {
        "client_id": DISCORD_CLIENT_ID,
        "client_secret": DISCORD_CLIENT_SECRET,
        "grant_type": "authorization_code",
        "code": code,
        "redirect_uri": DISCORD_REDIRECT_URI,
        "scope": "identify guilds" # Must match the scope requested in /login/discord
    }
    headers = {"Content-Type": "application/x-www-form-urlencoded"}

    try:
        token_response = requests.post(f"{DISCORD_API_BASE_URL}/oauth2/token", data=data, headers=headers)
        token_response.raise_for_status() # Raise HTTPError for bad responses (4xx or 5xx)
        token_json = token_response.json()
        access_token = token_json.get("access_token")
    except RequestException as e:
        print(f"Error exchanging code for token: {e}")
        return redirect(url_for("frontend_redirect", status="error_token_exchange"))

    if not access_token:
        return redirect(url_for("frontend_redirect", status="error_no_access_token"))

    # Use access token to get user info
    user_headers = {"Authorization": f"Bearer {access_token}"}
    discord_user_id = None
    display_name = "Unknown User"
    profile_picture_url = "https://discord.com/assets/f838f7c1ed7bc7ca2d4b.png" # Default Discord avatar

    try:
        user_response = requests.get(f"{DISCORD_API_BASE_URL}/users/@me", headers=user_headers)
        user_response.raise_for_status()
        user_info = user_response.json()

        discord_user_id = user_info.get("id")
        username = user_info.get("username")
        avatar = user_info.get("avatar")
        global_name = user_info.get("global_name") # New Discord username field

        # Construct display name (prioritize global_name, then username)
        display_name = global_name if global_name else username
        if avatar:
            # Construct PFP URL for users with custom avatars
            profile_picture_url = f"https://cdn.discordapp.com/avatars/{discord_user_id}/{avatar}.png"
        else:
            # Discord's default avatar logic for users without custom avatars
            # For new username system (discriminator is "0"), default avatar is based on user ID
            # For old username system, it's based on discriminator
            discriminator = user_info.get("discriminator")
            if discriminator and discriminator != "0":
                profile_picture_url = f"https://cdn.discordapp.com/embed/avatars/{int(discriminator) % 5}.png"
            else:
                profile_picture_url = f"https://cdn.discordapp.com/embed/avatars/{int(discord_user_id) >> 22 % 6}.png"

    except RequestException as e:
        print(f"Error fetching user info from Discord: {e}")
        return redirect(url_for("frontend_redirect", status="error_fetch_user_info"))

    if not discord_user_id:
        return redirect(url_for("frontend_redirect", status="error_missing_user_id"))

    # --- Role Verification ---
    # This is critical for access control. It requires your bot's token and GUILD_MEMBERS_INTENT.
    has_required_role = False
    if REQUIRED_GUILD_ID and DISCORD_BOT_TOKEN:
        try:
            # Fetch member details from the specific guild using your bot's token
            member_detail_response = requests.get(
                f"{DISCORD_API_BASE_URL}/guilds/{REQUIRED_GUILD_ID}/members/{discord_user_id}",
                headers={"Authorization": f"Bot {DISCORD_BOT_TOKEN}"}
            )
            member_detail_response.raise_for_status()
            member_data = member_detail_response.json()
            # Check if the REQUIRED_ROLE_ID is in the list of roles the member has
            if REQUIRED_ROLE_ID in member_data.get("roles", []):
                has_required_role = True
        except RequestException as e:
            print(f"Error checking member roles in guild {REQUIRED_GUILD_ID} for user {discord_user_id}: {e}")
            # If we can't check roles (e.g., bot token invalid, intents not enabled, bot not in guild),
            # assume no access for security. Log this for debugging.
            return redirect(url_for("frontend_redirect", status="error_role_check_failed"))
    else:
        print("WARNING: REQUIRED_GUILD_ID or DISCORD_BOT_TOKEN not set. Role verification skipped.")
        # If configuration is missing, deny access by default for security.
        return redirect(url_for("frontend_redirect", status="error_role_check_config_missing"))

    if not has_required_role:
        # If the user does not have the required role, redirect with an unauthorized status
        return redirect(url_for("frontend_redirect", status="unauthorized_role"))

    # If user has the required role, create a Firebase custom token
    try:
        # Use Discord user ID as Firebase UID for easy mapping
        firebase_custom_token = auth.create_custom_token(discord_user_id, {
            "discord_username": display_name,
            "discord_pfp": profile_picture_url,
            "has_role": True # Custom claim to indicate role access in Firebase rules/frontend logic
        }).decode('utf-8')
        print(f"Firebase custom token created for {display_name} ({discord_user_id})")

        # Redirect back to frontend with the token and user info in the URL fragment
        return redirect(url_for("frontend_redirect", token=firebase_custom_token,
                                 discord_user_id=discord_user_id,
                                 discord_username=display_name,
                                 discord_pfp=profile_picture_url,
                                 status="success"))
    except Exception as e:
        print(f"Error creating Firebase custom token: {e}")
        return redirect(url_for("frontend_redirect", status="error_firebase_token"))

@app.route("/frontend_redirect")
def frontend_redirect():
    """
    This endpoint is used to redirect back to the frontend application
    with the necessary parameters (e.g., Firebase token, Discord user info).
    It uses a JavaScript redirect to pass parameters in the URL fragment (#).
    """
    # IMPORTANT: Update this to your actual deployed frontend URL (from Vercel)
    # This will be your Vercel URL, e.g., "https://nzpacks-website.vercel.app"
    frontend_base_url = "https://nzpacks-website.vercel.app" # <<< UPDATE THIS FOR DEPLOYMENT

    # Extract parameters from the current request args
    token = request.args.get("token", "")
    discord_user_id = request.args.get("discord_user_id", "")
    discord_username = request.args.get("discord_username", "")
    discord_pfp = request.args.get("discord_pfp", "")
    status = request.args.get("status", "error")

    # Construct the redirect URL with parameters in the fragment for client-side JS to pick up
    redirect_url = (
        f"{frontend_base_url}#"
        f"token={token}&"
        f"discord_user_id={discord_user_id}&"
        f"discord_username={discord_username}&"
        f"discord_pfp={discord_pfp}&"
        f"status={status}"
    )

    # Return a simple HTML page that immediately redirects using JavaScript
    return f"""
    <!DOCTYPE html>
    <html>
    <head>
        <title>Redirecting...</title>
        <script>
            // Use replace to prevent the redirect page from being in browser history
            window.location.replace("{redirect_url}");
        </script>
    </head>
    <body>
        <p>Redirecting to frontend...</p>
        <a href="{redirect_url}">Click here if not redirected automatically</a>
    </body>
    </html>
    """

if __name__ == "__main__":
    # Ensure all required environment variables are set before starting the app
    # This check is crucial for both local development and deployment.
    required_env_vars = ["DISCORD_CLIENT_ID", "DISCORD_CLIENT_SECRET", "DISCORD_GUILD_ID", "DISCORD_BOT_TOKEN"]
    for var in required_env_vars:
        if not os.getenv(var):
            print(f"Error: Required environment variable '{var}' is not set.")
            exit(1)

    # Check for Firebase service account key, which is also critical
    if not os.getenv("FIREBASE_SERVICE_ACCOUNT_KEY"):
        print("Error: FIREBASE_SERVICE_ACCOUNT_KEY environment variable is not set. Firebase Admin SDK might not initialize.")
        # In a real production scenario, you might want to exit here as well.

    # Determine if running in development or production mode
    if os.getenv("FLASK_ENV") == "development":
        # For local development, use Flask's built-in development server
        print("Running Flask in DEVELOPMENT mode (http://localhost:5000)")
        app.run(debug=True, port=5000)
    else:
        # For production, use Gunicorn
        # Cloud Run expects applications to listen on port 8080
        print("Running Flask in PRODUCTION mode (using Gunicorn on port 8080)")
        import gunicorn.app.base
        class StandaloneApplication(gunicorn.app.base.BaseApplication):
            def load_config(self):
                # Bind to all interfaces on port 8080, as required by Cloud Run
                self.cfg.set("bind", "0.0.0.0:8080")
                # Number of worker processes. 1 is often sufficient for serverless.
                self.cfg.set("workers", 1)
                # Timeout for requests. Increased for potential Discord API latency.
                self.cfg.set("timeout", 60)
            def load(self):
                # Return the Flask app instance for Gunicorn to serve
                return app
        StandaloneApplication().run()
