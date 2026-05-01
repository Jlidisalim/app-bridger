# Deep Project Scan

Perform a comprehensive deep scan of the entire Bridger project. Check every layer systematically:

## Backend Scan

- **Routes**: Verify all route files in `backend/src/routes/` use the shared PrismaClient from `server.ts` (no `new PrismaClient()` per file)
- **Endpoints**: Confirm every endpoint has proper error handling, input validation via Zod schemas, and auth middleware
- **Route ordering**: Ensure static routes (e.g., `/popular-routes`) are defined before parameterized routes (`/:id`)
- **Database**: Check `backend/prisma/schema.prisma` models match what routes expect. Run `npx prisma validate`
- **WebSocket**: Verify `backend/src/services/websocket.ts` handles connection/disconnection properly
- **Security**: Check for hardcoded secrets, missing rate limiting, CORS misconfiguration

## Frontend Scan

- **Screens**: Scan every file in `src/screens/` for:
  - Hardcoded/placeholder data (names like "David Chen", "Sarah Miller", "$45", "LHR → JFK")
  - Buttons/TouchableOpacity without `onPress` handlers
  - Missing API calls (screens that should fetch data but render static content)
  - useEffect hooks that should call store actions on mount
- **Navigation**: Check `src/navigation/AppStack.tsx` and `MainTabs.tsx` for:
  - All screen wrappers pass required props
  - Callbacks wire to real API calls (not just navigation)
- **Store**: Verify `src/store/useAppStore.ts` actions call real API methods from `src/services/api.ts`
- **Services**: Check `src/services/api.ts` and `src/services/api/index.ts` for:
  - Endpoint path mismatches (e.g., `/payments/` vs `/wallet/`)
  - Missing error handling in API methods

## ML / Face Verification Scan

- **Python service**: Check `face-verification-service/` for:
  - CORS configuration and authentication
  - Rate limiting on endpoints
  - Proper error responses
- **Frontend integration**: Verify `src/services/api/faceVerification.ts`:
  - Does NOT manually set `Content-Type: multipart/form-data` (must let fetch auto-set boundary)
  - FormData is constructed correctly

## Cross-cutting Concerns

- Search for `TODO`, `FIXME`, `HACK`, `XXX` comments
- Check for `console.log` in production code
- Verify `.env` files are in `.gitignore`
- Check for any `any` type overuse in TypeScript files

Report all findings grouped by severity (Critical / Warning / Info) with file paths and line numbers.
