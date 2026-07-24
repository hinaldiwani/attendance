import { Router } from "express";

import {
  submitContactForm,
  getAllContactQueries,
  getContactQueryById,
  updateContactStatus,
  deleteContactQuery,
} from "../controllers/contactController.js";

import { requireAuth, requireRole } from "../middlewares/authMiddleware.js";

const router = Router();

/* ------------------------------------------
   Public Route
------------------------------------------ */

// Submit Contact Form
router.post("/submit", submitContactForm);

/* ------------------------------------------
   Admin Routes
------------------------------------------ */

router.use(requireAuth, requireRole("admin"));

// Get all contact queries
router.get("/", getAllContactQueries);

// View a specific query
router.get("/:id", getContactQueryById);

// Update query status
router.put("/:id/status", updateContactStatus);

// Delete query
router.delete("/:id", deleteContactQuery);

export default router;