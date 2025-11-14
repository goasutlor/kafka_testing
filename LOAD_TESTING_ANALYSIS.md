# Kafka Load Testing - Design Analysis

## 📊 Kafka Performance Testing Tools

### 1. **Native Kafka Tools** (kafka-producer-perf-test.sh / kafka-consumer-perf-test.sh)

**ข้อดี:**
- ✅ **Industry Standard**: เป็น tool ที่ใช้กันทั่วไปใน production
- ✅ **Comprehensive Metrics**: วัด metrics ครบถ้วนตามที่ Kafka ใช้
  - Throughput (records/sec, MB/sec)
  - Latency (p50, p95, p99, p999)
  - Producer/Consumer metrics
- ✅ **Optimized**: ถูก optimize มาแล้วสำหรับ performance testing
- ✅ **Reliable**: ผ่านการทดสอบมาแล้วใน production environments
- ✅ **Low Overhead**: overhead ต่ำกว่า Web App
- ✅ **Batch Processing**: รองรับ batch processing ได้ดี

**ข้อเสีย:**
- ❌ **Command Line Only**: ต้องใช้ command line
- ❌ **No UI**: ไม่มี UI สำหรับ visualization
- ❌ **Manual Configuration**: ต้อง config เองทุกครั้ง
- ❌ **No Real-time Monitoring**: ไม่มี real-time monitoring

**Metrics ที่ได้:**
```
Producer Performance:
- records/sec
- MB/sec
- avg latency (ms)
- max latency (ms)
- 50th percentile latency (ms)
- 95th percentile latency (ms)
- 99th percentile latency (ms)
- 99.9th percentile latency (ms)

Consumer Performance:
- records/sec
- MB/sec
- rebalance time (ms)
```

### 2. **Web App Integration** (ทำใน Web App เอง)

**ข้อดี:**
- ✅ **User Friendly**: มี UI ที่ใช้งานง่าย
- ✅ **Real-time Monitoring**: ดู metrics แบบ real-time
- ✅ **Visualization**: มี charts และ graphs
- ✅ **Configuration Management**: บันทึก configs ได้
- ✅ **Historical Data**: เก็บ history ของการทดสอบ
- ✅ **Integrated**: รวมกับ features อื่นๆ ได้

**ข้อเสีย:**
- ❌ **Overhead**: Web App มี overhead มากกว่า native tools
- ❌ **Limited Metrics**: อาจวัด metrics ไม่ครบเท่า native tools
- ❌ **Resource Intensive**: ใช้ resources มากกว่า
- ❌ **Not Industry Standard**: ไม่ใช่ standard tool

## 🎯 Recommendation: Hybrid Approach

### **Best Practice:**
ใช้ **Native Kafka Tools** เป็นหลัก แต่ **Integrate กับ Web App** สำหรับ:
1. **Configuration Management**: สร้าง config files จาก Web UI
2. **Result Visualization**: แสดงผล metrics จาก native tools
3. **Test Orchestration**: จัดการ test runs จาก Web UI
4. **Historical Tracking**: เก็บ history ของการทดสอบ

### **Architecture Design:**

```
┌─────────────────────────────────────────────────────────┐
│                    Web App (UI)                         │
│  ┌──────────────────────────────────────────────────┐  │
│  │  Load Test Configuration                          │  │
│  │  - Workload settings                              │  │
│  │  - Test parameters                                │  │
│  │  - Schedule tests                                 │  │
│  └──────────────────────────────────────────────────┘  │
│                        ↓                                │
│  ┌──────────────────────────────────────────────────┐  │
│  │  Test Orchestrator                               │  │
│  │  - Generate config files                         │  │
│  │  - Execute kafka-perf-test scripts               │  │
│  │  - Collect results                               │  │
│  └──────────────────────────────────────────────────┘  │
│                        ↓                                │
│  ┌──────────────────────────────────────────────────┐  │
│  │  Native Kafka Tools                              │  │
│  │  - kafka-producer-perf-test.sh                   │  │
│  │  - kafka-consumer-perf-test.sh                   │  │
│  └──────────────────────────────────────────────────┘  │
│                        ↓                                │
│  ┌──────────────────────────────────────────────────┐  │
│  │  Results Parser & Storage                        │  │
│  │  - Parse output                                  │  │
│  │  - Store metrics                                 │  │
│  └──────────────────────────────────────────────────┘  │
│                        ↓                                │
│  ┌──────────────────────────────────────────────────┐  │
│  │  Visualization & Reports                         │  │
│  │  - Charts (Throughput, Latency)                  │  │
│  │  - Comparison reports                            │  │
│  │  - Historical trends                             │  │
│  └──────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

## 🚀 Implementation Options

### **Option 1: Pure Web App (Simple but Limited)**
- ทำ Load Test ใน Web App เอง
- ใช้ kafkajs library
- วัด metrics พื้นฐาน (throughput, latency)
- **เหมาะสำหรับ**: Quick testing, Simple scenarios

### **Option 2: Hybrid (Recommended)**
- Web App สำหรับ configuration และ visualization
- เรียก native Kafka tools ผ่าน backend
- Parse results และแสดงใน Web UI
- **เหมาะสำหรับ**: Production-grade testing

### **Option 3: Script Wrapper (Best for Production)**
- Web App สร้าง config files
- Download scripts ที่พร้อมรัน
- User รัน script เองบน server
- Upload results กลับมาแสดงใน Web UI
- **เหมาะสำหรับ**: Production environments ที่ต้องการ control สูง

## 💡 Recommended Approach

### **Phase 1: Enhanced Web App Load Testing**
เพิ่ม Load Testing features ใน Web App ปัจจุบัน:
- Configurable workload (messages/sec, batch size, etc.)
- Basic metrics (throughput, latency)
- Real-time monitoring
- Simple reports

### **Phase 2: Native Tools Integration**
- Integrate กับ kafka-perf-test scripts
- Parse และแสดง results
- Advanced metrics (p95, p99, etc.)
- Comparison reports

### **Phase 3: Advanced Features**
- Test scheduling
- Automated testing
- Performance baselines
- Alerting

## 📋 Load Test Configuration Parameters

### **Producer Load Test:**
- **Topic**: Topic name
- **Num Records**: จำนวน records (หรือ -1 สำหรับ unlimited)
- **Record Size**: ขนาดของแต่ละ record (bytes)
- **Throughput**: Target throughput (records/sec, -1 = unlimited)
- **Compression**: Compression type (none, gzip, snappy, lz4, zstd)
- **Batch Size**: Batch size (bytes)
- **Acks**: Acknowledgment mode (0, 1, all)
- **Partitions**: จำนวน partitions
- **Key Distribution**: Key distribution strategy

### **Consumer Load Test:**
- **Topic**: Topic name
- **Num Messages**: จำนวน messages
- **Threads**: จำนวน consumer threads
- **Group ID**: Consumer group ID
- **From Beginning**: Consume from beginning
- **Show Metrics**: Show detailed metrics

## 🎯 Metrics to Track

### **Producer Metrics:**
- Records/sec
- MB/sec
- Avg latency (ms)
- Max latency (ms)
- P50, P95, P99, P999 latency
- Error rate
- Batch size efficiency

### **Consumer Metrics:**
- Records/sec
- MB/sec
- Lag
- Rebalance time
- Fetch latency
- Error rate

## 🔧 Implementation Considerations

### **If using Native Tools:**
1. **Server Requirements**: Server ต้องมี Kafka binaries
2. **File System**: ต้องมี access ไปยัง Kafka installation
3. **Permissions**: ต้องมี permission ในการรัน scripts
4. **Output Parsing**: ต้อง parse output จาก scripts

### **If using Web App:**
1. **Resource Management**: ต้องจัดการ resources ดีๆ
2. **Concurrent Tests**: จำกัดจำนวน concurrent tests
3. **Metrics Collection**: ต้อง collect metrics อย่างมีประสิทธิภาพ
4. **Real-time Updates**: ใช้ WebSocket สำหรับ real-time updates

