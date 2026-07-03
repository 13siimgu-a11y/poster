import bcrypt from "bcrypt";
import { prisma } from "../src/prisma.js";

async function main() {
    await prisma.plan.upsert({
        where: { name: "Trial" },
        update: {},
        create: {
            name: "Trial",
            price: 0,
            days: 14,
            description: "Стартовый пробный тариф",
        },
    });

    if (process.env.SEED_SUPER_ADMIN_EMAIL && process.env.SEED_SUPER_ADMIN_PASSWORD) {
        const passwordHash = await bcrypt.hash(process.env.SEED_SUPER_ADMIN_PASSWORD, 12);
        await prisma.user.upsert({
            where: { email: process.env.SEED_SUPER_ADMIN_EMAIL.toLowerCase() },
            update: {},
            create: {
                username: process.env.SEED_SUPER_ADMIN_USERNAME || "superadmin",
                email: process.env.SEED_SUPER_ADMIN_EMAIL.toLowerCase(),
                passwordHash,
                role: "super_admin",
            },
        });
    }
}

main()
    .then(async () => {
        await prisma.$disconnect();
    })
    .catch(async (error) => {
        console.error(error);
        await prisma.$disconnect();
        process.exit(1);
    });
