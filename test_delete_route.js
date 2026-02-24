import app from "./src/app.js";

// Get all routes from the app
function getRoutes(app) {
  const routes = [];

  app._router.stack.forEach((middleware) => {
    if (middleware.route) {
      // Routes registered directly on the app
      const methods = Object.keys(middleware.route.methods).map((m) =>
        m.toUpperCase(),
      );
      routes.push({
        path: middleware.route.path,
        methods: methods.join(", "),
      });
    } else if (middleware.name === "router") {
      // Router middleware
      middleware.handle.stack.forEach((handler) => {
        if (handler.route) {
          const methods = Object.keys(handler.route.methods).map((m) =>
            m.toUpperCase(),
          );
          const basePath = middleware.regexp
            .toString()
            .replace("/^", "")
            .replace("\\/?(?=\\/|$)/i", "")
            .replace(/\\\//g, "/")
            .split("?")[0];

          routes.push({
            path: basePath + handler.route.path,
            methods: methods.join(", "),
          });
        }
      });
    }
  });

  return routes;
}

console.log("\n=== All Routes ===\n");
const routes = getRoutes(app);

// Filter for attendance backup and delete routes
const backupRoutes = routes.filter(
  (r) => r.path.includes("backup") || r.path.includes("delete-history") || r.path.includes("bulk-delete"),
);
console.log("Attendance Backup & Delete Routes:");
backupRoutes.forEach((route) => {
  console.log(`  ${route.methods.padEnd(10)} ${route.path}`);
});

console.log("\n");
process.exit(0);
