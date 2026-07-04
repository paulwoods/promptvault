# Commit Workflow
1. Run all backend tests (e.g., `./gradlew test` or `mvn test`)
2. Run all frontend tests (e.g., `npm test`)
3. If any tests fail, report failures and stop — do NOT commit
4. Stage all changes with `git add -A`
5. Generate a descriptive commit message summarizing the changes
6. Commit with `git commit -m "<message>"`
7. Push to current branch with `git push`
8. Verify push landed on remote
