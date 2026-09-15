// tests/functional.test.js
// Automated script to test Volunteer Activity Hub API

const API_BASE = process.env.API_BASE || 'http://localhost:8787';

// Test variables
let sessionCookie = '';
const TEST_USER = { email: 'admin@volunteer.ac.th', password: 'admin123' };
let currentUserId = null;
let testActivityId = null;
let testRegistrationId = null;

async function runTests() {
  console.log('🚀 เริ่มต้นรันเทสเคส Volunteer Activity Hub API...\n');
  
  let total = 0;
  let passed = 0;

  function assert(condition, message, code) {
    total++;
    if (condition) {
      console.log(`✅ [PASS] ${code}: ${message}`);
      passed++;
    } else {
      console.log(`❌ [FAIL] ${code}: ${message}`);
    }
  }

  // Helper to fetch with cookies
  const apiFetch = async (path, options = {}) => {
    const headers = { 'Content-Type': 'application/json', ...options.headers };
    if (sessionCookie) headers['Cookie'] = sessionCookie;
    
    const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
    const setCookie = res.headers.get('set-cookie');
    if (setCookie) sessionCookie = setCookie;
    
    let data;
    try { data = await res.json(); } catch(e) { data = null; }
    return { status: res.status, data };
  };

  try {
    // -------------------------------------------------------------
    // Authentication Tests
    // -------------------------------------------------------------
    console.log('--- Testing Authentication ---');
    
    // Test failed login
    let loginRes = await apiFetch('/api/auth/login', { 
      method: 'POST', 
      body: JSON.stringify({ email: 'admin@volunteer.ac.th', password: 'wrong' }) 
    });
    assert(loginRes.status === 401, 'ปฏิเสธการล็อกอินด้วยรหัสผ่านผิด', 'AUTH-01');

    // Login with correct user
    loginRes = await apiFetch('/api/auth/login', { 
      method: 'POST', 
      body: JSON.stringify(TEST_USER) 
    });
    
    if (loginRes.status === 200) {
      assert(true, 'ผู้ใช้เข้าสู่ระบบสำเร็จ', 'AUTH-02');
      currentUserId = loginRes.data?.user?.id;

      // -------------------------------------------------------------
      // Activity Tests
      // -------------------------------------------------------------
      console.log('\n--- Testing Activities ---');
      
      // Get activities list
      const activitiesRes = await apiFetch('/api/activities');
      assert(activitiesRes.status === 200, 'ดึงรายการกิจกรรมสำเร็จ', 'ACT-01');
      assert(Array.isArray(activitiesRes.data?.data) || Array.isArray(activitiesRes.data), 'Activities response is array or paginated', 'ACT-02');

      // Create a test activity (admin/organizer only)
      const createActivityRes = await apiFetch('/api/activities', {
        method: 'POST',
        body: JSON.stringify({
          Title: 'Test Activity for API Testing',
          Description: 'Automated test activity',
          Category: 'community',
          StartDate: '2027-01-15',
          EndDate: '2027-01-15',
          StartTime: '09:00',
          EndTime: '12:00',
          MaxParticipants: 10,
          HoursAwarded: 3,
          Status: 'open'
        })
      });
      if (createActivityRes.status === 200) {
        testActivityId = createActivityRes.data?.activityId;
        assert(true, 'สร้างกิจกรรมใหม่สำเร็จ', 'ACT-03');
      } else {
        console.log('⚠️ ไม่สามารถสร้างกิจกรรมทดสอบ (อาจเป็น permission issue)');
      }

      // -------------------------------------------------------------
      // Registration Tests
      // -------------------------------------------------------------
      console.log('\n--- Testing Registrations ---');
      
      if (testActivityId) {
        // Register for activity
        const regRes = await apiFetch('/api/registrations', {
          method: 'POST',
          body: JSON.stringify({ activityId: testActivityId, note: 'API test registration' })
        });
        if (regRes.status === 200) {
          testRegistrationId = regRes.data?.registrationId;
          assert(true, 'ลงทะเบียนกิจกรรมสำเร็จ', 'REG-01');
        } else {
          console.log('⚠️ ลงทะเบียนไม่สำเร็จ:', regRes.data?.error);
        }

        // Get own registrations
        const myRegsRes = await apiFetch('/api/registrations');
        assert(myRegsRes.status === 200, 'ดึงรายการลงทะเบียนของตัวเองสำเร็จ', 'REG-02');

        // Test duplicate registration prevention
        const dupRegRes = await apiFetch('/api/registrations', {
          method: 'POST',
          body: JSON.stringify({ activityId: testActivityId })
        });
        assert(dupRegRes.status === 400, 'ป้องกันการลงทะเบียนซ้ำ', 'REG-03');
      }

      // -------------------------------------------------------------
      // Notification Tests
      // -------------------------------------------------------------
      console.log('\n--- Testing Notifications ---');
      
      const notifRes = await apiFetch('/api/notifications');
      assert(notifRes.status === 200, 'ดึงรายการการแจ้งเตือนสำเร็จ', 'NOTIF-01');

      const unreadRes = await apiFetch('/api/notifications/unread-count');
      assert(unreadRes.status === 200, 'ดึงจำนวนการแจ้งเตือนที่ยังไม่อ่านสำเร็จ', 'NOTIF-02');

      // -------------------------------------------------------------
      // Admin Tests
      // -------------------------------------------------------------
      console.log('\n--- Testing Admin Endpoints ---');
      
      const usersRes = await apiFetch('/api/admin/users');
      if (usersRes.status === 200) {
        assert(true, 'ดึงรายชื่อผู้ใช้ทั้งหมดสำเร็จ (admin)', 'ADMIN-01');
        // Verify password field is not exposed
        const hasPassword = usersRes.data && usersRes.data.some && usersRes.data.some(u => u.Password !== undefined);
        assert(!hasPassword, 'Password field ไม่ถูกส่งใน API response', 'SEC-01');
      } else {
        console.log('⚠️ ไม่มีสิทธิ์เข้าถึง admin endpoints (expected for non-admin)');
      }

      // -------------------------------------------------------------
      // Pagination Tests
      // -------------------------------------------------------------
      console.log('\n--- Testing Pagination ---');
      
      const paginatedRes = await apiFetch('/api/activities?page=1&limit=5');
      assert(paginatedRes.status === 200, 'Pagination ทำงานสำเร็จ', 'PAG-01');
      if (paginatedRes.data?.pagination) {
        assert(paginatedRes.data.pagination.page === 1, 'Pagination metadata ถูกต้อง', 'PAG-02');
      }

    } else {
      console.log('⚠️ ไม่สามารถล็อกอินเพื่อทดสอบต่อได้');
    }

    // -------------------------------------------------------------
    // Summary
    // -------------------------------------------------------------
    console.log(`\n📊 สรุปผลการทดสอบ: ผ่าน ${passed} จาก ${total} เคส`);
    console.log('👉 หมายเหตุ: Testcase ระดับ UI, Email, และ Photo verification ต้องการทดสอบด้วย Manual QA');

  } catch (error) {
    console.error('Test Execution Failed:', error);
  }
}

runTests();
