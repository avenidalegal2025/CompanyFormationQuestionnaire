# Auth0 Callback URL mismatch ("Guardar y continuar más tarde" / "Continuar")

If clicking **Guardar y continuar más tarde**, **Continuar**, or signup/login shows Auth0 error **"Callback URL mismatch"**, the redirect URL your app is sending is not in Auth0’s allowed list.

## Fix in Auth0 Dashboard

1. Open [Auth0 Dashboard](https://manage.auth0.com/) → **Applications** → your application (e.g. the one for `dev-hx5xtiwldskmbisi`).
2. Go to **Settings**.
3. In **Allowed Callback URLs**, add:

   **All Vercel deployments (production + every preview) — one line covers every deploy:**
   ```
   https://*.vercel.app/api/auth/callback/auth0
   ```

   **Local dev:**
   ```
   http://localhost:3000/api/auth/callback/auth0
   ```

   You do **not** need to add each preview URL (e.g. `...-jmu41xks9.vercel.app`) when you deploy; the wildcard `*.vercel.app` matches all of them. See [Auth0 wildcard callback URLs](https://support.auth0.com/center/s/article/Dynamic-Callback-urls-with-wildcards).

4. In **Allowed Logout URLs**, add: `https://*.vercel.app`, `http://localhost:3000` (or your main production domain).
5. Click **Save Changes**.

## How the app builds the callback URL

The app sends:

- **Callback URL:** `{current origin}/api/auth/callback/auth0`  
  So if you open the app at `https://company-formation-questionnaire.vercel.app`, it uses  
  `https://company-formation-questionnaire.vercel.app/api/auth/callback/auth0`.  
  That exact string must be in **Allowed Callback URLs** in Auth0.

After adding the right URLs and saving, "Guardar y continuar más tarde" and login/signup should work from that origin.
