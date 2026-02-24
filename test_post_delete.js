import http from "http";

const options = {
  hostname: "localhost",
  port: 3100,
  path: "/api/teacher/attendance/backup/1/delete",
  method: "POST",
  headers: {
    "Content-Type": "application/json",
  },
};

console.log(
  "Testing POST delete request to:",
  `http://${options.hostname}:${options.port}${options.path}`,
);
console.log("Method:", options.method);
console.log("");

const req = http.request(options, (res) => {
  console.log("Status Code:", res.statusCode);
  console.log("Status Message:", res.statusMessage);
  console.log("");

  let data = "";
  res.on("data", (chunk) => {
    data += chunk;
  });

  res.on("end", () => {
    console.log("Response Body:", data);
    console.log("");

    if (res.statusCode === 404) {
      console.log("❌ Route not found - POST delete route is not registered");
    } else if (res.statusCode === 401) {
      console.log("✅ Route exists and requires authentication (expected)");
    } else if (res.statusCode === 200) {
      console.log("✅ Route exists and responded successfully");
    } else {
      console.log("Route responded with status:", res.statusCode);
    }
  });
});

req.on("error", (e) => {
  console.error("Request error:", e.message);
});

req.end();
