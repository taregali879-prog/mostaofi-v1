# Infrastructure
Local: docker-compose.yml يوفر PostgreSQL 18 وRedis 8.2 وMinIO.
Staging/Production: استخدم خدمات مُدارة، Secrets Manager، TLS، WAF، backups وPITR. لا تستخدم كلمات مرور docker-compose في أي بيئة حقيقية.
