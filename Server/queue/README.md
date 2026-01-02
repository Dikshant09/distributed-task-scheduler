# Queue

Redis Streams queue implementation for task distribution.

## Purpose

Provide a durable, replayable message queue for distributing tasks to workers.

## Why Redis Streams?

- **Persistent** - Messages survive Redis restarts
- **Consumer Groups** - Multiple workers share load
- **Redelivery** - Failed messages can be retried
- **Pending Entry List (PEL)** - Track unacknowledged messages
- **Simple** - Easier than Kafka, more features than pub/sub

## File

**`redis-queue.js`** - Redis Streams wrapper

## Key Operations

### 1. Initialize Consumer Group

```javascript
await redisQueue.initGroup();
```

Creates consumer group `workers` for stream `tasks:pending`.

### 2. Push Task

```javascript
await redisQueue.pushTask(taskId, { attempt: 0 });
```

Adds message to stream:
```
XADD tasks:pending * task_id abc-123 attempt 0
```

### 3. Consume Task

```javascript
const msg = await redisQueue.consume(workerId);
// Returns: { messageId, task_id, attempt }
```

Reads from stream with consumer group:
```
XREADGROUP GROUP workers worker-abc123 BLOCK 5000 COUNT 1 STREAMS tasks:pending >
```

**Key Features:**
- Blocks for 5 seconds if no messages
- Reads 1 message at a time
- Tracks consumption per worker

### 4. Acknowledge Message

```javascript
await redisQueue.ack(messageId);
```

Removes message from Pending Entry List:
```
XACK tasks:pending workers <messageId>
```

**Important:** Only ACK after task is processed and DB is updated.

### 5. Get Queue Depth

```javascript
const { count } = await redisQueue.getPendingCount();
```

Returns number of pending messages in stream.

## Message Flow

```
Dispatcher
  ↓
XADD tasks:pending (push message)
  ↓
Redis Streams
  ↓
XREADGROUP (worker consumes)
  ↓
Worker processes task
  ↓
XACK (acknowledge)
  ↓
Message removed from PEL
```

## Consumer Groups

Consumer groups enable multiple workers to share load:

```
Stream: tasks:pending
  ↓
Consumer Group: workers
  ├─ worker-1 (reads messages)
  ├─ worker-2 (reads messages)
  └─ worker-3 (reads messages)
```

**Benefits:**
- Each message delivered to only one worker
- Load balancing automatic
- Workers can join/leave dynamically

## Pending Entry List (PEL)

Tracks messages that were delivered but not yet acknowledged:

```
Worker consumes message → Added to PEL
Worker processes task   → Still in PEL
Worker ACKs message     → Removed from PEL
```

**If worker crashes:**
- Message stays in PEL
- Can be claimed by another worker
- Prevents message loss

## Configuration

Environment variables:
- `REDIS_HOST` - Redis server host (default: localhost)
- `REDIS_PORT` - Redis server port (default: 6379)

## Stream Structure

**Stream Name:** `tasks:pending`

**Message Format:**
```
{
  task_id: "abc-123-def-456",
  attempt: 0
}
```

**Consumer Group:** `workers`

## Error Handling

### Connection Errors
```javascript
try {
    await redisQueue.pushTask(taskId, metadata);
} catch (err) {
    // Redis unavailable
    // Task remains in DB, will be dispatched when Redis recovers
}
```

### Consumption Errors
```javascript
const msg = await redisQueue.consume(workerId);
if (!msg) {
    // No messages (timeout after 5s)
    // Loop continues
}
```

## Design Principles

1. **Queue as Transport** - Not source of truth (DB is)
2. **At-Least-Once** - Messages may be delivered multiple times
3. **Idempotent Consumers** - Workers handle duplicate delivery
4. **Durable** - Messages persist across Redis restarts
5. **Observable** - Queue depth visible via `getPendingCount()`

## Comparison with Alternatives

| Feature | Redis Streams | Kafka | RabbitMQ |
|---------|--------------|-------|----------|
| Persistence | ✅ | ✅ | ✅ |
| Consumer Groups | ✅ | ✅ | ✅ |
| Setup Complexity | Low | High | Medium |
| Throughput | High | Very High | High |
| Local Development | ✅ Easy | ❌ Heavy | ⚠️ Medium |

For this project, Redis Streams is the sweet spot: persistent, scalable, and simple.
