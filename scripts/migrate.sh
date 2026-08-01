#!/bin/bash
set -e

echo "▶ Pushing Prisma schema to database..."
npx prisma db push --accept-data-loss

echo "▶ Seeding reference data and default users..."
npx prisma db seed

echo "✅ Database migration complete."
