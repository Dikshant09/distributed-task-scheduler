---
# yaml-language-server: $schema=schemas/page.schema.json
Object type:
    - Page
Backlinks:
    - Distributed Task Scheduler with Fault Tolerance & Leader Election
Creation date: "2026-01-13T17:12:14Z"
Created by:
    - Dikshant
id: bafyreifaxob4n7drqasifivpdgshx25dj7kvwywubknhdjssbyz3k64yhm
---
# Idempotency   
Now I have a complete picture of how idempotency is maintained in this project. Let me explain it to you:   
## How Idempotency is Maintained   
The project implements **idempotency** at multiple layers to prevent duplicate task creation and ensure safe client retries:   
### 1. Database Layer (Core Enforcement)   
In   
001\_init.sql:   
```

sql

idempotency_key VARCHAR(100),

...

CREATE UNIQUE INDEX IF NOT EXISTS idx_tasks_idempotency

ON tasks(idempotency_key)

WHERE idempotency_key IS NOT NULL;

```
- The   
    ```
    idempotency_key
    
    ```
    column stores a unique identifier for each task.   
- A **partial unique index** ensures no two tasks can have the same   
    ```
    idempotency_key
    
    ```
    (when it's not   
    ```
    NULL
    
    ```
    ).   
   
### 2. Repository Layer (Conflict Handling)   
In   
tasks.repo.js:   
```

javascript

const createTask = async (task) => {

  try {

    const res = await db.query(query, [id, type, payload, scheduledAt, idempotencyKey]);

    return res.rows[0];

  } catch (err) {

    if (err.code === '23505') { // Unique violation

      // Fetch existing task instead of failing

      const existing = await db.query('SELECT * FROM tasks WHERE idempotency_key = $1', [idempotencyKey]);

      return existing.rows[0];

    }

    throw err;

  }

};

```
When a duplicate   
```
idempotency_key

```
is inserted:   
- PostgreSQL throws error code   
    ```
    23505
    
    ```
    (unique constraint violation)   
- Instead of failing, the code **returns the existing task** with that key   
- This makes retries safe — clients get the same task back   
   
### 3. API/Controller Layer   
In   
jobs.controller.js:   
```

javascript

const finalIdempotencyKey = idempotencyKey || generateId();

```
- If the client provides an   
    ```
    idempotencyKey
    
    ```
    , it's used.   
- If not, a new unique ID is auto-generated (though this loses client-side retry safety).   
   
### 4. Validator Layer (Your File)   
In   
job.validator.js:   
The validator has a commented-out enforcement:   
```

javascript

if (!idempotencyKey) {

    // return next(new ValidationError('idempotencyKey is required'));

}

```
This was intentionally left flexible — the system doesn't *require* the client to pass one, but recommends it for retry safety.   
 --- 
### Summary of Idempotency Flow   
```

Client Request (with idempotencyKey)

         ↓

   Validator (optional check)

         ↓

   Controller (uses or generates key)

         ↓

   Repository → INSERT into DB

         ↓

   ┌─────────────────────────────────┐

   │ Unique Index Check              │

   │ ✓ New key → Task created        │

   │ ✗ Duplicate → Return existing   │

   └─────────────────────────────────┘

```
This design ensures that even if a client retries the same request (e.g., due to network timeout), the system won't create duplicate tasks — it simply returns the already-created task.   
