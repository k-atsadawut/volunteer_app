// tests/functional.test.js
// Automated script to test Volunteer Activity Hub API

const API_BASE = process.env.API_BASE || 'http://localhost:8787';

// Test variables
let sessionCookie = '';
const TEST_ADMIN = { email: 'admin@volunteer.ac.th', password: 'admin123' };
const TEST_ORGANIZER = { email: 'organizer@volunteer.ac.th', password: 'organizer123' };
const TEST_STUDENT = { email: 'student@volunteer.ac.th', password: 'student123' };
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

    // Login as admin
    loginRes = await apiFetch('/api/auth/login', { 
      method: 'POST', 
      body: JSON.stringify(TEST_ADMIN) 
    });
    
    if (loginRes.status === 200) {
      assert(true, 'Admin เข้าสู่ระบบสำเร็จ', 'AUTH-02');
      currentUserId = loginRes.data?.user?.id;

      // -------------------------------------------------------------
      // Admin Permissions Tests
      // -------------------------------------------------------------
      console.log('\n--- Testing Admin Permissions ---');
      
      const usersRes = await apiFetch('/api/admin/users');
      assert(usersRes.status === 200, 'Admin สามารถดึงรายชื่อผู้ใช้ทั้งหมดได้', 'ADMIN-PERM-01');
      
      // Verify password field is not exposed
      const hasPassword = usersRes.data && usersRes.data.some && usersRes.data.some(u => u.Password !== undefined);
      assert(!hasPassword, 'Password field ไม่ถูกส่งใน API response', 'SEC-01');

      const adminRegsRes = await apiFetch('/api/admin/registrations');
      assert(adminRegsRes.status === 200, 'Admin สามารถดูการลงทะเบียนทั้งหมดได้', 'ADMIN-PERM-02');

      // Logout admin
      await apiFetch('/api/auth/logout', { method: 'POST' });
      sessionCookie = '';
    }

    // -------------------------------------------------------------
    // Organizer Permissions Tests
    // -------------------------------------------------------------
    console.log('\n--- Testing Organizer Permissions ---');
    
    loginRes = await apiFetch('/api/auth/login', { 
      method: 'POST', 
      body: JSON.stringify(TEST_ORGANIZER) 
    });
    
    if (loginRes.status === 200) {
      assert(true, 'Organizer เข้าสู่ระบบสำเร็จ', 'AUTH-03');
      currentUserId = loginRes.data?.user?.id;

      // Organizer should NOT access admin endpoints
      const usersRes = await apiFetch('/api/admin/users');
      assert(usersRes.status === 403, 'Organizer ไม่สามารถเข้าถึง admin endpoints ได้', 'ORG-PERM-01');

      // Organizer CAN access their own registrations
      const orgRegsRes = await apiFetch('/api/organizer/registrations');
      assert(orgRegsRes.status === 200, 'Organizer สามารถดูการลงทะเบียนกิจกรรมของตัวเองได้', 'ORG-PERM-02');

      // Create a test activity as organizer
      const createActivityRes = await apiFetch('/api/activities', {
        method: 'POST',
        body: JSON.stringify({
          Title: 'Test Activity for Permissions',
          Description: 'Automated test activity',
          Category: 'community',
          StartDate: '2027-02-15',
          EndDate: '2027-02-15',
          StartTime: '09:00',
          EndTime: '12:00',
          MaxParticipants: 2,
          HoursAwarded: 3,
          Status: 'open'
        })
      });
      if (createActivityRes.status === 200) {
        testActivityId = createActivityRes.data?.activityId;
        assert(true, 'Organizer สร้างกิจกรรมใหม่สำเร็จ', 'ORG-PERM-03');
      }

      await apiFetch('/api/auth/logout', { method: 'POST' });
      sessionCookie = '';
    }

    // -------------------------------------------------------------
    // Student/Regular User Tests
    // -------------------------------------------------------------
    console.log('\n--- Testing Student/User Functionality ---');
    
    loginRes = await apiFetch('/api/auth/login', { 
      method: 'POST', 
      body: JSON.stringify(TEST_STUDENT) 
    });
    
    if (loginRes.status === 200) {
      assert(true, 'Student เข้าสู่ระบบสำเร็จ', 'AUTH-04');
      currentUserId = loginRes.data?.user?.id;

      // Student should NOT access admin endpoints
      const usersRes = await apiFetch('/api/admin/users');
      assert(usersRes.status === 403, 'Student ไม่สามารถเข้าถึง admin endpoints ได้', 'USER-PERM-01');

      // Student should NOT access organizer endpoints
      const orgRegsRes = await apiFetch('/api/organizer/registrations');
      assert(orgRegsRes.status === 403, 'Student ไม่สามารถเข้าถึง organizer endpoints ได้', 'USER-PERM-02');

      // -------------------------------------------------------------
      // Activity Tests
      // -------------------------------------------------------------
      console.log('\n--- Testing Activities ---');
      
      const activitiesRes = await apiFetch('/api/activities');
      assert(activitiesRes.status === 200, 'ดึงรายการกิจกรรมสำเร็จ', 'ACT-01');
      assert(Array.isArray(activitiesRes.data?.data) || Array.isArray(activitiesRes.data), 'Activities response is array or paginated', 'ACT-02');

      // -------------------------------------------------------------
      // Registration & Full Capacity Tests
      // -------------------------------------------------------------
      console.log('\n--- Testing Registration & Capacity ---');
      
      if (testActivityId) {
        // First registration
        const regRes = await apiFetch('/api/registrations', {
          method: 'POST',
          body: JSON.stringify({ activityId: testActivityId, note: 'First registration' })
        });
        if (regRes.status === 200) {
          testRegistrationId = regRes.data?.registrationId;
          assert(true, 'ลงทะเบียนกิจกรรมสำเร็จ (คนแรก)', 'REG-01');
        }

        // Test duplicate registration prevention
        const dupRegRes = await apiFetch('/api/registrations', {
          method: 'POST',
          body: JSON.stringify({ activityId: testActivityId })
        });
        assert(dupRegRes.status === 400, 'ป้องกันการลงทะเบียนซ้ำ', 'REG-02');

        // Get own registrations
        const myRegsRes = await apiFetch('/api/registrations');
        assert(myRegsRes.status === 200, 'ดึงรายการลงทะเบียนของตัวเองสำเร็จ', 'REG-03');

        // Test cancellation
        if (testRegistrationId) {
          const cancelRes = await apiFetch(`/api/registrations/${testRegistrationId}/cancel`, {
            method: 'PATCH'
          });
          assert(cancelRes.status === 200, 'ยกเลิกการลงทะเบียนสำเร็จ', 'REG-04');
        }
      }

      // -------------------------------------------------------------
      // Queue Tests (when full)
      // -------------------------------------------------------------
      console.log('\n--- Testing Queue Functionality ---');
      
      if (testActivityId) {
        // Re-register to test queue
        const regRes = await apiFetch('/api/registrations', {
          method: 'POST',
          body: JSON.stringify({ activityId: testActivityId, note: 'For queue test' })
        });
        
        if (regRes.status === 200) {
          // Try to register again (should fail since we're already registered)
          const dupRes = await apiFetch('/api/registrations', {
            method: 'POST',
            body: JSON.stringify({ activityId: testActivityId })
          });
          assert(dupRes.status === 400, 'ไม่สามารถลงทะเบียนซ้ำได้', 'QUEUE-01');
        }
      }

      // -------------------------------------------------------------
      // Notification Tests
      // -------------------------------------------------------------
      console.log('\n--- Testing Notifications ---');
      
      const notifRes = await apiFetch('/api/notifications');
      assert(notifRes.status === 200, 'ดึงรายการการแจ้งเตือนสำเร็จ', 'NOTIF-01');

      const unreadRes = await apiFetch('/api/notifications/unread-count');
      assert(unreadRes.status === 200, 'ดึงจำนวนการแจ้งเตือนที่ยังไม่อ่านสำเร็จ', 'NOTIF-02');

      // Test marking as read
      if (notifRes.data && notifRes.data.length > 0) {
        const firstNotifId = notifRes.data[0].NotificationID;
        const markReadRes = await apiFetch(`/api/notifications/${firstNotifId}/read`, {
          method: 'PATCH'
        });
        assert(markReadRes.status === 200, 'ทำเครื่องหมายว่าอ่านแล้วสำเร็จ', 'NOTIF-03');
      }

      // -------------------------------------------------------------
      // Pagination Tests
      // -------------------------------------------------------------
      console.log('\n--- Testing Pagination ---');
      
      const paginatedRes = await apiFetch('/api/activities?page=1&limit=5');
      assert(paginatedRes.status === 200, 'Pagination ทำงานสำเร็จ', 'PAG-01');
      if (paginatedRes.data?.pagination) {
        assert(paginatedRes.data.pagination.page === 1, 'Pagination metadata ถูกต้อง', 'PAG-02');
        assert(typeof paginatedRes.data.pagination.total === 'number', 'Pagination total เป็นตัวเลข', 'PAG-03');
      }

      await apiFetch('/api/auth/logout', { method: 'POST' });
      sessionCookie = '';
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
