# Critical Backend Audit & Runtime Test Report
**Project:** eFiling Dashboard Backend (`efiling_dashboard`)  
**Audit Date:** September 18, 2026  
**Status:** Live Database Tested & Active  

---

## 📱 WhatsApp / Quick-Share Summary (Copy & Paste Ready)

```text
🚨 *BACKEND RUNTIME AUDIT UPDATE - eFiling Dashboard*

Hi Sir,
I re-ran live `curl` tests against our Node.js backend. 

✅ *Database Status:*
The live DB at 119.30.113.19 is now successfully connected and returning data (e.g. 265 total files found for 2026-27). 

However, we have 4 critical blockers & code flaws that need immediate attention before frontend integration:

1️⃣ *CORS Crash & Windows Path Leak (HTTP 500)*
• Problem: `.env` has `ALLOWED_ORIGIN=http://localhost:3000`, blocking frontends (Vite on `localhost:5173`).
• Impact: When CORS rejects an origin, Express crashes with a 500 HTML error page leaking our internal Windows directory paths (`C:/Users/.../server.js`).
• Fix: Allow frontend ports in `.env` and return clean HTTP 403 instead of throwing an unhandled Error.

2️⃣ *Plaintext Database Connection (No SSL)*
• Problem: We are connecting to the remote public DB (`119.30.113.19`) over the public internet with no SSL encryption.
• Impact: High security risk — live financial numbers and credentials are transmitted unencrypted.
• Fix: Enable SSL on the PostgreSQL instance and pool configuration, or connect through a private VPN/SSH tunnel.

3️⃣ *Auth "Fail-Open" Security Vulnerability*
• Problem: In `auth.js`, `if (!expectedToken) return next()` silently disables authentication if `DASHBOARD_API_SECRET` is ever missing or fails to load.
• Impact: Any server misconfiguration makes all confidential dashboard stats completely public to anyone on the web.
• Fix: Fail-closed (deny requests if secret is missing).

4️⃣ *Data Type Bug (Numbers Returned as Strings)*
• Problem: PostgreSQL `COUNT(*)` returns strings: `"total_files": "265"`, `"draft": "18"`, `"total_estimated_cost": "48724766.00"`.
• Impact: On the frontend, arithmetic operations like `total + 10` will concatenate as `"26510"` instead of `275`, breaking dashboard charts.
• Fix: Parse SQL counts with `::integer` / `Number()` or configure `pg.types.setTypeParser`.

5️⃣ *Missing Health Check & HTML 404s*
• Problem: `/health` returns a 404 HTML page. Any invalid route returns Express HTML instead of standard JSON API responses.
• Fix: Add `GET /health` with DB ping and a centralized JSON 404 error handler.

👉 *Next Action:* 
I can patch `server.js`, `auth.js`, and `dashboard.js` right now to resolve all 5 issues.
```

---

## 🔍 Detailed Test Log & Reproduction

### 1. Successful Query Execution & Data Type Issue
- **Command:**
  ```bash
  curl.exe -i -H 'Authorization: Bearer <TOKEN>' http://localhost:3000/api/dashboard/stats
  ```
- **Response:** `HTTP/1.1 200 OK` (Latency: ~376ms)
- **Returned Data:**
  ```json
  {
    "success": true,
    "year": "2026-27",
    "status_counts": {
      "total_files": "265",
      "total_work_related": "0",
      "draft": "18",
      "in_progress": "247"
    }
  }
  ```
- **Finding:** Notice all numeric aggregations are returned as strings (`"265"`, `"18"`). In JavaScript, `COUNT(*)` returns `bigint`, which `pg` serializes as string. This causes math and chart bugs on the frontend.

---

### 2. CORS Crash & File System Path Disclosure
- **Command:**
  ```bash
  curl.exe -i -H "Origin: http://localhost:5173" http://localhost:3000/api/dashboard/stats
  ```
- **Response:** `HTTP/1.1 500 Internal Server Error` (HTML format)
- **Leaked Payload:**
  ```html
  <pre>Error: Not allowed by CORS
      at origin (file:///C:/Users/zaidb/OneDrive/Desktop/one/server.js:20:16)
      at C:\Users\zaidb\OneDrive\Desktop\one\node_modules\cors\lib\index.js:219:13
  </pre>
  ```
- **Finding:** If a developer runs Vite on port 5173, the server crashes with a 500 HTML response leaking internal Windows paths.

---

### 3. HTTP Parameter Pollution (No Schema Validation)
- **Command:**
  ```bash
  curl.exe -i -H 'Authorization: Bearer <TOKEN>' 'http://localhost:3000/api/dashboard/stats?year=2026-27&year=2025-26'
  ```
- **Response:**
  ```json
  {
    "success": true,
    "year": ["2026-27", "2025-26"],
    "status_counts": { "total_files": "0" }
  }
  ```
- **Finding:** Passing duplicate query parameters causes `req.query.year` to become an Array. The query passes an array into `$1`, resulting in zero matched files and returning an Array for `year` instead of a String.

---

### 4. Health Check / Undefined Route Handlers
- **Command:**
  ```bash
  curl.exe -i http://localhost:3000/health
  ```
- **Response:** `HTTP/1.1 404 Not Found` with HTML content: `<pre>Cannot GET /health</pre>`.
- **Finding:** No health check endpoint exists; error responses leak default Express HTML rather than standard JSON (`{"error": "Endpoint not found"}`).
