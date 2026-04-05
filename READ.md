http://localhost:5000/api

✅ Register
POST /api/auth/register
{
  "name": "Test NGO",
  "email": "test@mail.com",
  "password": "123456",
  "confirmPassword": "123456"
}
✅ Login
POST /api/auth/login
{
  "email": "test@mail.com",
  "password": "123456"
}
///////////////////////////////////////////////////
http://localhost:5000/api/auth/login
{
    "user": {
        "downloadCount": 0,
        "downloadLimit": 0,
        "_id": "69c2db604eca616fd4b45f6f",
        "name": "Test NGO",
        "email": "test@mail.com",
        "password": "$2b$10$mbzrAmKpV2WforhYnIsXv.GB9v15YyazqdMnypd0lJQ66BdPii88S",
        "role": "ngo",
        "createdAt": "2026-03-24T18:43:44.541Z",
        "updatedAt": "2026-03-24T18:43:44.541Z",
        "__v": 0
    }
}

///////////////////////////////////////////////////
✅ Forgot Password
POST /api/auth/forgot-password
{
  "email": "test@mail.com"
}
✅ Reset Password
POST /api/auth/reset-password
{
  "token": "reset_token_here",
  "password": "new123456"
}
✅ Google Auth
POST /api/auth/google
{
  "token": "google_oauth_token"
}
👤 USER APIs
✅ Get Profile
GET /api/users/me
✅ Update Profile
PUT /api/users/me
{
  "name": "Updated NGO",
  "organization": "New Org"
}
✅ Subscription
GET /api/users/me/subscription
✅ Delete Account
DELETE /api/users/me
✅ Upload Avatar
POST /api/users/me/avatar

👉 Form-data (file upload)

⭐ SAVED GRANTS
✅ Get Saved
GET /api/users/me/saved-grants
✅ Save Grant
POST /api/users/me/saved-grants/65f123abc
✅ Remove Grant
DELETE /api/users/me/saved-grants/65f123abc
🎯 GRANTS APIs
✅ List Grants
GET /api/grants?country=India&area=Health&page=1&limit=10
✅ Get Single Grant
GET /api/grants/65f123abc
✅ Search
GET /api/grants/search?q=education
✅ Filters Meta
GET /api/grants/filters/meta
✅ Featured
GET /api/grants/featured
✅ Expiring Soon
GET /api/grants/expiring-soon
🔒 Create Grant
POST /api/grants
{
  "title": "New Grant",
  "category": "Research",
  "donor": "World Bank",
  "country": ["India"],
  "maxAmount": 5000,
  "currency": "USD",
  "deadline": "2026-12-31",
  "isOpen": true,
  "content": {}
}
🔒 Update Grant (FULL ❌)
PUT /api/grants/65f123abc
🔥 Update Single Field (BEST)
PATCH /api/grants/65f123abc/field
{
  "field": "featured",
  "value": true
}
🔒 Delete Grant
DELETE /api/grants/65f123abc
🤖 PROPOSAL AI APIs
✅ Generate Proposal
POST /api/proposals/generate
{
  "grantId": "65f123abc",
  "input": {
    "topic": "Climate change"
  }
}
✅ Regenerate
POST /api/proposals/regenerate/65f123abc
{
  "section": "methodology"
}
✅ Status
GET /api/proposals/generate/status/65f123abc
✅ Score
POST /api/proposals/score
{
  "content": {}
}
📄 PROPOSAL MANAGEMENT
✅ List
GET /api/proposals?status=completed
✅ Get One
GET /api/proposals/65f123abc
✅ Create
POST /api/proposals
{
  "title": "My Proposal",
  "grantId": "65f123abc"
}
✅ Update
PUT /api/proposals/65f123abc
{
  "title": "Updated Proposal",
  "content": {}
}
✅ Update Status
PATCH /api/proposals/65f123abc/status
{
  "status": "completed"
}
✅ Delete
DELETE /api/proposals/65f123abc
✅ Duplicate
POST /api/proposals/65f123abc/duplicate
✅ Download (LIMIT API 🔥)
GET /api/proposals/65f123abc/download
🧠 ADMIN APIs
✅ Get Users
GET /api/admin/users?paid=true&active=true
✅ Stats
GET /api/admin/stats
✅ Update Plan
PUT /api/admin/users/65f123abc/plan
{
  "plan": "Pro",
  "status": "active"
}
✅ Publish Grant
PUT /api/admin/grants/65f123abc/publish
{
  "isOpen": true,
  "featured": true
}