import api from './api';

/*
 * Foodie Authentication Service
 *
 * Backend APIs:
 * GET  /users/
 * POST /users/
 * GET  /roles/
 * GET  /user-roles/
 * POST /user-roles/
 *
 * Backend user fields:
 * id
 * username
 * first_name
 * last_name
 * email
 * phone
 * is_active
 * is_phone_verified
 *
 * Backend role fields:
 * id
 * name
 * description
 *
 * Role IDs:
 * 1 = SUPER_ADMIN
 * 2 = ADMIN
 * 3 = RESTAURANT_MANAGER
 * 4 = STAFF
 * 5 = CUSTOMER
 */

const CUSTOMER_ROLE_ID = 5;

/* -------------------------------------------------------
   Helper Functions
------------------------------------------------------- */

/**
 * Convert any phone number into only digits.
 * Example:
 * +91 7981354982 -> 917981354982
 */
const normalizePhone = (phone = '') => {
  return String(phone).replace(/\D/g, '');
};

/**
 * Convert phone number into backend format.
 * Example:
 * 7981354982 -> +917981354982
 */
const formatPhone = (phone = '') => {
  const digits = normalizePhone(phone);

  if (!digits) {
    return '';
  }

  if (digits.startsWith('91') && digits.length === 12) {
    return `+${digits}`;
  }

  return `+91${digits}`;
};

/**
 * Get the last 10 digits of an Indian mobile number.
 */
const getLast10Digits = (phone = '') => {
  const digits = normalizePhone(phone);

  if (digits.length >= 10) {
    return digits.slice(-10);
  }

  return digits;
};

/**
 * Convert backend user into frontend user object.
 */
const createFrontendUser = (user, role = 'customer') => {
  return {
    id: user.id,
    name:
      user.name ||
      `${user.first_name || ''} ${user.last_name || ''}`.trim() ||
      'Customer',
    email: user.email || '',
    role,
    phone: user.phone || user.phone_number || user.mobile || ''
  };
};

/**
 * Find the role assigned to a user.
 */
let cachedRoles = null;
let cachedUserRoles = null;

const getUserRole = async (userId) => {
  try {
    if (!cachedRoles || !cachedUserRoles) {
      const [rolesResponse, userRolesResponse] = await Promise.all([
        api.get('/users/roles/?page_size=100').catch(() => ({ data: [] })),
        api.get('/users/user-roles/?page_size=100').catch(() => ({ data: [] }))
      ]);
      const rawRoles = rolesResponse.data?.data || (Array.isArray(rolesResponse.data) ? rolesResponse.data : (rolesResponse.data?.results || []));
      const rawUserRoles = userRolesResponse.data?.data || (Array.isArray(userRolesResponse.data) ? userRolesResponse.data : (userRolesResponse.data?.results || []));
      
      cachedRoles = Array.isArray(rawRoles) ? rawRoles : [];
      cachedUserRoles = Array.isArray(rawUserRoles) ? rawUserRoles : [];
    }

    const roles = cachedRoles;
    const userRoles = cachedUserRoles;

    const userRole = userRoles.find(
      (item) => Number(item.user) === Number(userId)
    );

    if (!userRole) {
      return 'customer';
    }

    const role = roles.find(
      (item) => Number(item.id) === Number(userRole.role)
    );

    if (!role) {
      return 'customer';
    }

    const roleName = String(role.name || '').toUpperCase();

    switch (roleName) {
      case 'SUPER_ADMIN':
      case 'ADMIN':
      case 'RESTAURANT_MANAGER':
      case 'ACCOUNTANT':
        return 'admin';

      case 'CUSTOMER':
        return 'customer';

      case 'STAFF':
      case 'CHEF':
      case 'CASHIER':
      case 'DELIVERY':
      case 'SUPPORT':
      default:
        return 'employee';
    }
  } catch (error) {
    console.error('Failed to get user role:', error);

    return 'customer';
  }
};

/* -------------------------------------------------------
   Authentication Service
------------------------------------------------------- */

export const authService = {
  /* =====================================================
     ADMIN / EMPLOYEE LOGIN
     ===================================================== */

  login: async (emailOrPhone, password) => {
    const { staffLogin, explain } = await import('./adminApi');
    try {
      return await staffLogin(emailOrPhone, password);
    } catch (err) {
      throw new Error(explain(err));
    }
  },

  loginLegacyUnused: async (emailOrPhone, password) => {
    try {
      const rawIdentifier = String(emailOrPhone || '').trim();
      const targetIdentifier = rawIdentifier.toLowerCase();
      const cleanPhone = rawIdentifier.replace(/\D/g, '').slice(-10);
      const targetPassword = String(password || '');

      if (!rawIdentifier || !targetPassword) {
        throw new Error('Email/Phone and password are required');
      }

      // Since the backend does not provide password validation endpoints or return passwords,
      // and we are not using local storage, we will validate based on user existence.

      // 1. Direct Administrator Login Check
      const isAdminIdentifier = ['adim123@gmail.com', 'admin123@gmail.com', 'admin@foodie.com'].includes(targetIdentifier);
      if (isAdminIdentifier) {
        const isValidAdminPw = targetPassword === '123456';
        if (!isValidAdminPw) {
          throw new Error('Incorrect password for Administrator account.');
        }

        const adminUser = {
          id: 1,
          name: 'Restaurant Administrator',
          email: targetIdentifier,
          role: 'admin',
          designation: 'General Manager & Admin',
          department: 'Management'
        };

        return {
          token: `token_admin_${Date.now()}`,
          user: {
            ...createFrontendUser(adminUser, 'admin'),
            ...adminUser,
            role: 'admin'
          }
        };
      }

      // 2. Fetch and aggregate all registered employees in the Admin Staff Directory
      // (Custom added employees + Backend staff accounts)

      // Fetch backend users
      let backendStaff = [];
      try {
        const [usersResponse, rolesResponse, userRolesResponse] = await Promise.all([
          api.get('/users/users/?page_size=100').catch(() => ({ data: [] })),
          api.get('/users/roles/?page_size=100').catch(() => ({ data: [] })),
          api.get('/users/user-roles/?page_size=100').catch(() => ({ data: [] }))
        ]);

        const rawUsers = usersResponse.data?.data || (Array.isArray(usersResponse.data) ? usersResponse.data : (usersResponse.data?.results || []));
        const allRoles = Array.isArray(rolesResponse.data?.data) ? rolesResponse.data.data : (Array.isArray(rolesResponse.data) ? rolesResponse.data : []);
        const allUserRoles = Array.isArray(userRolesResponse.data?.data) ? userRolesResponse.data.data : (Array.isArray(userRolesResponse.data) ? userRolesResponse.data : []);

        backendStaff = (rawUsers || [])
          .map((u, idx) => {
            const userRoleObj = allUserRoles.find(ur => Number(ur.user) === Number(u.id));
            const roleId = userRoleObj ? userRoleObj.role : null;
            const roleObj = allRoles.find(r => Number(r.id) === Number(roleId));

            const rawRoleName = (roleObj?.name || u.role || (u.is_superuser ? 'ADMIN' : (u.is_staff ? 'STAFF' : 'CUSTOMER'))).toUpperCase();
            const isEmp = rawRoleName !== 'CUSTOMER' || u.is_staff || u.is_superuser;
            const isAdmin = rawRoleName === 'ADMIN' || rawRoleName === 'SUPER_ADMIN' || u.is_superuser;

            // Exclude pure customers completely
            if (!isEmp && !isAdmin) return null;

            const fullName = [u.first_name, u.last_name].filter(Boolean).join(' ') || u.name || u.username || `Staff #${u.id}`;

            return {
              id: String(u.id),
              employeeId: `EMP-${100 + idx}`,
              name: fullName,
              email: u.email || 'N/A',
              phone: u.phone_number || u.phone || 'N/A',
              role: isAdmin ? 'admin' : 'employee',
              designation: isAdmin ? 'Restaurant Administrator' : 'Staff Associate',
              department: isAdmin ? 'Management' : 'Dining Floor',
              password: u.password
            };
          })
          .filter(Boolean);
      } catch (err) {
        console.warn('Could not fetch backend staff for auth verification:', err);
      }

      // Combine directory records
      const allStaffDirectory = new Map();

      // Merge backend staff
      backendStaff.forEach(bu => {
        const key = bu.email && bu.email !== 'N/A' ? String(bu.email).toLowerCase() : `id_${bu.id}`;
        if (allStaffDirectory.has(key)) {
          const existing = allStaffDirectory.get(key);
          allStaffDirectory.set(key, {
            ...existing,
            ...bu,
            name: bu.name || existing.name,
            phone: bu.phone !== 'N/A' ? bu.phone : existing.phone
          });
        } else {
          allStaffDirectory.set(key, bu);
        }
      });

      const staffList = Array.from(allStaffDirectory.values());

      // 3. Match user strictly by email, 10-digit phone number, or employee ID
      const matchedEmployee = staffList.find(emp => {
        const empEmail = String(emp.email || '').trim().toLowerCase();
        const empPhone = String(emp.phone || emp.phone_number || '').replace(/\D/g, '').slice(-10);
        const empId = String(emp.employeeId || emp.id || '').trim().toLowerCase();
        const empUsername = String(emp.username || '').trim().toLowerCase();

        return (
          (empEmail && empEmail !== 'n/a' && empEmail === targetIdentifier) ||
          (cleanPhone && cleanPhone.length === 10 && empPhone && empPhone === cleanPhone) ||
          (empId && empId === targetIdentifier) ||
          (empUsername && empUsername === targetIdentifier)
        );
      });

      // 4. If matching employee found in directory, allow login
      if (matchedEmployee) {
        // Validate password against stored employee password or overrides
        const cleanId = String(matchedEmployee.email || '').trim().toLowerCase();
        const cleanDigits = String(matchedEmployee.phone || '').replace(/\D/g, '').slice(-10);
        
        let passwordOverrides = {};
        try {
          const overrides1 = JSON.parse(localStorage.getItem('foodie_employee_passwords') || '{}');
          const overrides2 = JSON.parse(localStorage.getItem('foodie_password_overrides') || '{}');
          passwordOverrides = { ...overrides1, ...overrides2 };
        } catch (e) {}

        const expectedPassword = passwordOverrides[cleanId] || (cleanDigits && passwordOverrides[cleanDigits]) || matchedEmployee.password || '123456';
        
        if (targetPassword !== expectedPassword) {
          throw new Error('Invalid email, phone number, or password.');
        }

        const roleName = matchedEmployee.role === 'admin' ? 'admin' : 'employee';
        const sessionUser = {
          id: matchedEmployee.id || matchedEmployee.employeeId || `emp_${Date.now()}`,
          name: matchedEmployee.name || 'Staff Member',
          email: matchedEmployee.email || rawIdentifier,
          phone: matchedEmployee.phone || '',
          role: roleName,
          designation: matchedEmployee.designation || (roleName === 'admin' ? 'Administrator' : 'Staff Associate'),
          department: matchedEmployee.department || 'Dining Floor',
          employeeId: matchedEmployee.employeeId || matchedEmployee.id
        };

        return {
          token: `token_emp_${sessionUser.id}_${Math.random().toString(36).substring(2, 9)}`,
          user: {
            ...createFrontendUser(sessionUser, roleName),
            ...sessionUser,
            role: roleName
          }
        };
      }

      // 5. No matching employee in admin users directory -> STRICT ACCESS DENIAL
      throw new Error('Access denied. No employee registered with this email or phone number in the Staff Directory. Please contact your Administrator.');
    } catch (error) {
      console.error('Admin/Employee login error:', error);

      if (error.response) {
        console.error('Status:', error.response.status);
        console.error('Response:', error.response.data);
      }

      throw new Error(
        error.response?.data?.detail ||
        error.response?.data?.message ||
        error.message ||
        'Login failed'
      );
    }
  },

  /* =====================================================
     CUSTOMER SIGNUP
     ===================================================== */

  signup: async (name, email, phone) => {
    try {
      const cleanName = String(name || '').trim();
      const cleanEmail = String(email || '').trim().toLowerCase();
      const cleanPhone = getLast10Digits(phone);

      if (!cleanName) {
        throw new Error('Name is required');
      }

      if (!cleanPhone || cleanPhone.length !== 10) {
        throw new Error('Please enter a valid mobile number');
      }

      const formattedPhone = formatPhone(cleanPhone);

      /*
       * Generate a unique username.
       *
       * Example:
       * customer7981354982
       */
      const username = `customer${cleanPhone}`;

      /*
       * Create user using the CURRENT backend schema.
       */
      const userResponse = await api.post('/users/users/', {
        username,
        name: cleanName,
        email:
          cleanEmail ||
          `${username}@foodie.com`,
        phone: formattedPhone,
        password: 'hash_pwd',
        is_active: true,
        is_phone_verified: true
      });

      const newUser = userResponse.data;

      if (!newUser || !newUser.id) {
        throw new Error(
          'User was created but backend did not return user ID'
        );
      }

      /*
       * Assign CUSTOMER role.
       *
       * IMPORTANT:
       * CUSTOMER role ID = 5
       */
      try {
        await api.post('/users/user-roles/', {
          user: newUser.id,
          role: CUSTOMER_ROLE_ID
        });
      } catch (roleError) {
        console.error(
          'Failed to assign customer role:',
          roleError
        );

        /*
         * Do not hide the error.
         * The user exists, but role assignment failed.
         */
        throw new Error(
          'Customer account was created, but customer role could not be assigned'
        );
      }

      return {
        token: `token_${newUser.id}`,

        user: createFrontendUser(
          newUser,
          'customer'
        )
      };
    } catch (error) {
      console.error('Customer signup error:', error);

      if (error.response) {
        console.error(
          'Signup status:',
          error.response.status
        );

        console.error(
          'Signup response:',
          error.response.data
        );
      }

      throw new Error(
        error.response?.data?.detail ||
        error.response?.data?.message ||
        'Unable to create customer account'
      );
    }
  },

  /* =====================================================
     SEND OTP
     ===================================================== */

  sendOTP: async (phone) => {
    const cleanPhone = getLast10Digits(phone);
    if (!cleanPhone || cleanPhone.length !== 10) {
      throw new Error('Please enter a valid 10-digit mobile number');
    }
    try {
      const res = await api.post('/auth/otp/send/', { phone: cleanPhone });
      return { success: true, message: 'OTP sent', dev_otp: res.data?.dev_otp };
    } catch (error) {
      const detail = error.response?.data?.detail;
      throw new Error(typeof detail === 'string' ? detail : (error.message || 'Unable to send OTP'));
    }
  },

  /* =====================================================
     VERIFY OTP / CUSTOMER LOGIN
     ===================================================== */

  verifyOTP: async (phone, otp) => {
    const cleanOtp = String(otp || '').replace(/\D/g, '').trim();
    const cleanPhone = getLast10Digits(phone);
    if (!cleanOtp || cleanOtp.length !== 6) throw new Error('Please enter a valid 6-digit OTP code');
    if (!cleanPhone || cleanPhone.length !== 10) throw new Error('Please enter a valid mobile number');
    try {
      const guestToken = sessionStorage.getItem('foodie_guest_token') || localStorage.getItem('foodie_guest_token');
      const res = await api.post('/auth/otp/verify/', { phone: cleanPhone, otp: cleanOtp, ...(guestToken ? { guest_token: guestToken } : {}) });
      const data = res.data || {};
      const account = data.user || {};
      return {
        token: data.access,
        refresh: data.refresh,
        user: {
          id: account.id, name: account.name || `Customer ${cleanPhone.slice(-4)}`,
          phone: account.phone || cleanPhone, role: 'customer',
          is_first_time_customer: data.is_first_time_customer,
        },
      };
    } catch (error) {
      if (error.response?.data?.detail) throw new Error(error.response.data.detail);
      throw error;
    }
  },
};

export default authService;
