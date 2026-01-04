import SuperTokens from 'supertokens-web-js';
import Session from 'supertokens-web-js/recipe/session';
import EmailPassword from 'supertokens-web-js/recipe/emailpassword'

export function initSuperTokens() {
  SuperTokens.init({
    appInfo: {
      appName: "Distribox",
      apiDomain: import.meta.env.VITE_API_DOMAIN || "http://localhost:8080",
      apiBasePath: "/auth",
    },
    recipeList: [
      EmailPassword.init(),
      Session.init(),
    ],
  });
}
