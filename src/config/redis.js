const redis = require("redis");

let redisClient = null;

if (process.env.NODE_ENV === "production") {
  const redisConfig = {
    password: process.env.REDIS_PASSWORD || undefined,
  };

  if (process.env.REDIS_SOCKET_PATH) {
    redisConfig.socket = {
      path: process.env.REDIS_SOCKET_PATH,
      keepAlive: true,
      reconnectStrategy: (retries) => Math.min(retries * 200, 5000),
    };
  } else if (process.env.REDIS_URL) {
    redisConfig.url = process.env.REDIS_URL;
  } else if (process.env.REDIS_HOST) {
    redisConfig.socket = {
      host: process.env.REDIS_HOST,
      port: parseInt(process.env.REDIS_PORT || "6379", 10),
      keepAlive: true,
      reconnectStrategy: (retries) => Math.min(retries * 200, 5000),
    };
  } else {
    console.warn("⚠️  Aucune config Redis (REDIS_URL/HOST/SOCKET_PATH)");
  }

  if (redisConfig.url || redisConfig.socket) {
    redisClient = redis.createClient(redisConfig);
  }

  if (redisClient) {
    redisClient.on("error", (err) => {
      console.error("Redis Client Error:", err);
    });

    redisClient.on("ready", () => {
      console.log("Redis prêt");
    });
  }
} else {
  console.log("Redis non configuré (mode dev)");
}

async function connectRedis() {
  if (redisClient) {
    try {
      if (!redisClient.isOpen) {
        await redisClient.connect();
      }
      console.log("Connexion Redis établie");
    } catch (err) {
      console.error("Impossible de se connecter à Redis:", err);
      console.warn("L'application va continuer avec le store mémoire en mode dégradé.");
    }
  }
}

module.exports = { redisClient, connectRedis };
