from supertokens_python import init, InputAppInfo, SupertokensConfig
from supertokens_python.recipe import emailpassword, session
from supertokens_python.recipe.emailpassword import EmailPasswordRecipe
from supertokens_python.recipe.session import SessionRecipe
import os


def init_supertokens():
    init(
        app_info=InputAppInfo(
            app_name=os.getenv("APP_NAME", "Distribox"),
            api_domain=os.getenv("API_DOMAIN", "http://localhost:8000"),
            website_domain=os.getenv(
                "WEBSITE_DOMAIN", "http://localhost:5173"),
            api_base_path="/auth",
            website_base_path="/auth",
        ),
        supertokens_config=SupertokensConfig(
            connection_uri=os.getenv(
                "SUPERTOKENS_CONNECTION_URI", "http://localhost:3567"),
            api_key=os.getenv("SUPERTOKENS_API_KEY", ""),
        ),
        framework="fastapi",
        recipe_list=[
            session.init(),
            emailpassword.init(),
        ],
        mode="asgi",
    )
