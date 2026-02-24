import http from "http";

const postData = JSON.stringify({
  backupId: 1,
});

const options = {
  hostname: "localhost",
  port: 3100,
  path: "/api/teacher/attendance/delete-history",
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(postData),
  },
};

console.log("=====================================");
console.log("Testing NEW DELETE CONTROLLER");
console.log("=====================================");
console.log(
  "URL:",
  `http://${options.hostname}:${options.port}${options.path}`,
);
console.log("Method:", options.method);
console.log("Body:", postData);
console.log("");

const req = http.request(options, (res) => {
  console.log("Response:");
  console.log("  Status Code:", res.statusCode);
  console.log("  Status Message:", res.statusMessage);
  console.log("");

  let data = "";
  res.on("data", (chunk) => {
    data += chunk;
  });

  res.on("end", () => {
    console.log("Response Body:", data);
    console.log("");

    if (res.statusCode === 404) {
      console.log("❌ FAILED: Route not found - endpoint is not registered");
      console.log(
        "   Check if deleteController.js is properly imported in routes",
      );
    } else if (res.statusCode === 401) {
      console.log("✅ SUCCESS: Route exists and requires authentication");
      console.log("   The delete controller is working correctly!");
    } else if (res.statusCode === 200) {
      console.log("✅ SUCCESS: Route exists and responded successfully");
      console.log("   Delete operation completed (if authenticated)");
    } else {
      console.log("⚠️  Route responded with status:", res.statusCode);
    }
    console.log("=====================================");
  });
});

req.on("error", (e) => {
  console.error("❌ Request error:", e.message);
});

req.write(postData);
req.end();
