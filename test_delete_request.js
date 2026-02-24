import http from "http";

const options = {
  hostname: "localhost",
  port: 3100,
  path: "/api/teacher/attendance/backup/1",
  method: "DELETE",
  headers: {
    "Content-Type": "application/json",
  },
};

console.log(
  "Testing DELETE request to:",
  `http://${options.hostname}:${options.port}${options.path}`,
);
console.log("Method:", options.method);
console.log("");

const req = http.request(options, (res) => {
  console.log("Status Code:", res.statusCode);
  console.log("Status Message:", res.statusMessage);
  console.log("Headers:", JSON.stringify(res.headers, null, 2));
  console.log("");

  let data = "";
  res.on("data", (chunk) => {
    data += chunk;
  });

  res.on("end", () => {
    console.log("Response Body:", data);
    console.log("");

    if (res.statusCode === 404) {
      console.log(
        "❌ Route not found - DELETE route is not registered properly",
      );
    } else if (res.statusCode === 401) {
      console.log("✅ Route exists but requires authentication (expected)");
    } else {
      console.log("✅ Route exists and responded");
    }
  });
});

req.on("error", (e) => {
  console.error("Request error:", e.message);
});

req.end();
