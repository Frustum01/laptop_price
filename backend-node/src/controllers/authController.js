import jwt from "jsonwebtoken";

/* ===============================
   LOGIN
================================= */
export const login = (req, res) => {
  const { email, password } = req.body;

  // Demo fixed credentials
  const validEmail = "avijitmandal1435@gmail.com";
  const validPassword = "Avijit@2004";

  if (email !== validEmail || password !== validPassword) {
    return res.status(401).json({
      success: false,
      message: "Invalid credentials"
    });
  }

  const token = jwt.sign(
    { email },
    process.env.JWT_SECRET || "secretkey",
    { expiresIn: "1d" }
  );

  res.json({
    success: true,
    token,
    role: "employee",
    user: {
      email
    }
  });
};

/* ===============================
   SIGNUP
================================= */
export const signup = (req, res) => {
  const {
    firstName,
    lastName,
    email,
    phone,
    password
  } = req.body;

  res.json({
    success: true,
    message: "Signup successful",
    user: {
      firstName,
      lastName,
      email,
      phone
    }
  });
};

/* ===============================
   GET ME
================================= */
export const getMe = (req, res) => {
  res.json({
    success: true,
    user: {
      email: "avijitmandal1435@gmail.com",
      name: "Avijit Mandal",
      role: "employee"
    }
  });
};

/* ===============================
   GET ALL USERS
================================= */
export const getAllUsers = (req, res) => {
  res.json({
    success: true,
    users: []
  });
};

/* ===============================
   UPDATE USER ROLE
================================= */
export const updateUserRole = (req, res) => {
  res.json({
    success: true,
    message: "User role updated"
  });
};

/* ===============================
   UPDATE USER STATUS
================================= */
export const updateUserStatus = (req, res) => {
  res.json({
    success: true,
    message: "User status updated"
  });
};

/* ===============================
   DELETE USER
================================= */
export const deleteUser = (req, res) => {
  res.json({
    success: true,
    message: "User deleted"
  });
};

/* ===============================
   GET USER STATS
================================= */
export const getUserStats = (req, res) => {
  res.json({
    success: true,
    stats: {
      total: 0,
      active: 0,
      inactive: 0
    }
  });
};

/* ===============================
   GET PENDING USERS
================================= */
export const getPendingUsers = (req, res) => {
  res.json({
    success: true,
    users: []
  });
};

/* ===============================
   APPROVE USER
================================= */
export const approveUser = (req, res) => {
  res.json({
    success: true,
    message: "User approved"
  });
};