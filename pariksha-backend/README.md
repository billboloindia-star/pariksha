# Pariksha backend

Email/password accounts + attempt history for the Pariksha exam app, on AWS Lambda
(FastAPI + Mangum), DynamoDB, deployed with the Serverless Framework under the `billbolo`
AWS profile.

## Endpoints

- `POST /auth/signup` `{email, password}` → `{token, email}`
- `POST /auth/login` `{email, password}` → `{token, email}`
- `GET /attempts` (header `Authorization: Bearer <token>`) → list of attempt records
- `POST /attempts` (header `Authorization: Bearer <token>`) → stores one attempt record

## Deploy

```bash
cp .env.example .env     # fill in a real JWT_SECRET (long random string)
npx serverless deploy --stage dev --aws-profile billbolo
```

Note the `HttpApiUrl` output — that's `VITE_API_URL` for the frontend. Repeat with
`--stage prod` once verified.

## Resources created

All prefixed `pariksha-` so nothing collides with other projects in the same AWS account:

- DynamoDB tables `pariksha-users-{stage}`, `pariksha-attempts-{stage}`
- Lambda function + API Gateway HTTP API (`pariksha-{stage}-app`)
- A Serverless deployment S3 bucket (shared across this account's Serverless services)
