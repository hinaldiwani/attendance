import mysql from "mysql2/promise";

async function findCorrectPassword() {
    console.log("🔍 Testing MySQL 8.0 Connection with Different Credentials\n");

    const passwordsToTry = [
        { user: 'root', password: '' },           // No password
        { user: 'root', password: 'root' },       // root
        { user: 'root', password: 'password' },   // password
        { user: 'root', password: 'admin' },      // admin
        { user: 'root', password: 'mysql' },      // mysql
        { user: 'hinal', password: 'hinal' },     // hinal credentials
        { user: 'root', password: 'hinal' },      // root with hinal password
    ];

    for (const cred of passwordsToTry) {
        try {
            console.log(`Testing: ${cred.user} / ${cred.password || '(no password)'}`);

            const connection = await mysql.createConnection({
                host: 'localhost',
                port: 3305,
                user: cred.user,
                password: cred.password,
                connectTimeout: 3000
            });

            const [result] = await connection.query("SELECT 1");
            await connection.end();

            console.log(`\n✅ SUCCESS! Credentials found:\n`);
            console.log(`   User: ${cred.user}`);
            console.log(`   Password: ${cred.password || '(empty)'}`);
            console.log();

            return cred;

        } catch (error) {
            console.log(`   ❌ Failed`);
        }
    }

    console.log("\n❌ None of the common passwords worked.");
    console.log("\n🔑 Please check:");
    console.log("   1. What credentials did you use to connect MySQL Client 8.0?");
    console.log("   2. Check MySQL 8.0 configuration file for root password");
    console.log();
}

findCorrectPassword();
