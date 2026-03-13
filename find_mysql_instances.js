import mysql from "mysql2/promise";

async function findAllMySQLInstances() {
    console.log("🔍 FINDING ALL MySQL INSTANCES ON YOUR SYSTEM\n");
    console.log("=".repeat(60));

    const ports = [3306, 3307, 3308, 3309, 33060];
    const instances = [];

    for (const port of ports) {
        try {
            console.log(`\n📡 Testing port ${port}...`);
            const connection = await mysql.createConnection({
                host: 'localhost',
                port: port,
                user: 'hinal',
                password: 'hinal',
                connectTimeout: 3000
            });

            const [version] = await connection.query("SELECT VERSION() as version");
            const [hostname] = await connection.query("SELECT @@hostname as host");
            const [datadir] = await connection.query("SELECT @@datadir as dir");

            console.log(`   ✅ MySQL found on port ${port}`);
            console.log(`      Version: ${version[0].version}`);
            console.log(`      Host: ${hostname[0].host}`);
            console.log(`      Data Dir: ${datadir[0].dir}`);

            // Check for acadmark_attendance database
            const [dbs] = await connection.query("SHOW DATABASES LIKE '%acadmark%'");
            console.log(`      Acadmark databases: ${dbs.length}`);

            if (dbs.length > 0) {
                for (const db of dbs) {
                    const dbName = db[Object.keys(db)[0]];
                    console.log(`         - ${dbName}`);

                    // Check student count in this database
                    try {
                        await connection.query(`USE ${dbName}`);
                        const [count] = await connection.query("SELECT COUNT(*) as count FROM student_details_db");
                        console.log(`           Students: ${count[0].count}`);

                        if (count[0].count > 0) {
                            console.log(`           ⭐ THIS IS WHERE YOUR DATA IS!`);
                        }
                    } catch (err) {
                        console.log(`           (table doesn't exist)`);
                    }
                }
            }

            instances.push({
                port,
                version: version[0].version,
                datadir: datadir[0].dir,
                hasAcadmark: dbs.length > 0
            });

            await connection.end();

        } catch (error) {
            console.log(`   ❌ No MySQL on port ${port}`);
        }
    }

    console.log("\n" + "=".repeat(60));
    console.log("\n📊 SUMMARY:");
    console.log(`   Found ${instances.length} MySQL instance(s)\n`);

    instances.forEach(inst => {
        console.log(`   Port ${inst.port}:`);
        console.log(`      Version: ${inst.version}`);
        console.log(`      Has acadmark DB: ${inst.hasAcadmark ? 'YES ✅' : 'NO'}`);
        console.log(`      Data Dir: ${inst.datadir}`);
        console.log();
    });

    console.log("=".repeat(60));
    console.log("\n🎯 SOLUTION:");
    console.log("\nYour application is currently using port 3306.");
    console.log("Your MySQL Client 8.0 CLI might be connected to a different port.");
    console.log("\nTo connect MySQL Client 8.0 CLI to the correct instance:");
    console.log("   1. Close MySQL Client 8.0");
    console.log("   2. Reopen it");
    console.log("   3. Connect with: localhost:3306");
    console.log("   4. Username: hinal");
    console.log("   5. Password: hinal");
    console.log("\nOR run this command:");
    console.log("   mysql -u hinal -p -h localhost -P 3306");
    console.log();
}

findAllMySQLInstances();
