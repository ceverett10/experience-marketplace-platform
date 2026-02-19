release: npx prisma migrate deploy --schema packages/database/prisma/schema.prisma
web: npm run start:web
worker: npm run start --workspace=@experience-marketplace/demand-generation
worker-fast: npm run start:fast --workspace=@experience-marketplace/demand-generation
worker-heavy: npm run start:heavy --workspace=@experience-marketplace/demand-generation
worker-infra: ENABLE_SCHEDULER=true npm run start:infra --workspace=@experience-marketplace/demand-generation
