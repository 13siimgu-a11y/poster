import "dotenv/config";

export const env = {
    nodeEnv: process.env.NODE_ENV || "development",
    port: Number(process.env.PORT || 3000),
    databaseUrl: process.env.DATABASE_URL || "",
    jwtAccessSecret: process.env.JWT_ACCESS_SECRET || "dev_access_secret_change_me",
    jwtRefreshSecret: process.env.JWT_REFRESH_SECRET || "dev_refresh_secret_change_me",
    jwtAccessExpires: process.env.JWT_ACCESS_EXPIRES || "15m",
    jwtRefreshExpires: process.env.JWT_REFRESH_EXPIRES || "7d",
    refreshCookieName: process.env.REFRESH_COOKIE_NAME || "pos_poster_refresh",
    uploadDir: process.env.UPLOAD_DIR || "uploads",
    openaiApiKey: process.env.OPENAI_API_KEY || "",
    isProduction: process.env.NODE_ENV === "production",
};
