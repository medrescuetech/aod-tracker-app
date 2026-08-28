# Default Test Users

This file contains the default user credentials for testing the Clinic Tracker application.

## User Accounts

### 1. Administrator (Full Access)
- **Username:** `admin`
- **Password:** `Admin123!`
- **Role:** admin
- **Permissions:** Full system access
- **Name:** System Administrator
- **Display Name:** Administrator
- **Unique ID:** ADMIN001
- **Email:** admin@clinic.local

### 2. Supervisor (Manager Access)
- **Username:** `supervisor`
- **Password:** `Super123!`
- **Role:** supervisor
- **Permissions:** Manage tests, non-negatives, persons, reports
- **Name:** Test Supervisor
- **Display Name:** T Supervisor
- **Unique ID:** SUPER001
- **Email:** supervisor@clinic.local
- **Credentials:** RN, BAT Certified
- **Is Clinician:** Yes

### 3. Standard User (Limited Access)
- **Username:** `user`
- **Password:** `User123!`
- **Role:** user
- **Permissions:** Enter and view tests, read persons
- **Name:** Test User
- **Display Name:** T User
- **Unique ID:** USER001
- **Email:** user@clinic.local
- **Credentials:** BAT Certified
- **Is Clinician:** Yes

## Role Permissions Summary

| Role | Permissions |
|------|-------------|
| **admin** | `["all"]` - Full system access |
| **supervisor** | `["tests.*","persons.*","reports.*","nonneg.*"]` - Manage tests and non-negatives |
| **user** | `["tests.create","tests.read","persons.read"]` - Enter and view tests |

## Testing Checklist

- [ ] Login as `admin` - verify full access to all features
- [ ] Login as `supervisor` - verify can manage tests and view reports
- [ ] Login as `user` - verify can enter tests and view basic data
- [ ] Verify top-right user menu shows display name and role
- [ ] Test profile update (change display name)
- [ ] Test password change functionality
- [ ] Verify user management page shows all users with correct roles

## Notes

- All users are set as active clinicians by default
- The display name format is "First Initial + Last Name" (e.g., "T User")
- Unique IDs are shown on the user management page but not used for login
- Users can update their own profile via the top-right user menu
- Admins can manage all users via Settings > Users & Clinicians

## Default Admin

The system also has a built-in default admin that was created during first startup:
- **Username:** `admin` (or as configured)
- **Password:** Set via `ADMIN_PASSWORD` environment variable (default: `admin123`)

This account is separate from the test users above and is used for initial system setup.
