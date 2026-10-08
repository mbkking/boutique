// Re-export du callback Supabase partage (e-mail + OAuth).
// Sans cette route, un lien de reinitialisation de mot de passe emis depuis
// l'espace admin renvoyait une 404 (NEXT_PUBLIC_APP_URL pointe sur cette app).
export * from "@repo/app/auth/callback/route";