import db from "../config/db.js";

// Submit Contact Form
export const submitContactForm = async (req, res) => {
  try {
    const {
      name,
      email,
      role,
      contactNumber,
      problem,
    } = req.body;

    if (
      !name ||
      !email ||
      !role ||
      !contactNumber ||
      !problem
    ) {
      return res.status(400).json({
        success: false,
        message: "All fields are required.",
      });
    }

    await db.query(
      `
      INSERT INTO contact_queries
      (name,email,role,contact_number,problem)
      VALUES (?,?,?,?,?)
      `,
      [
        name,
        email,
        role,
        contactNumber,
        problem,
      ]
    );

    res.status(201).json({
      success: true,
      message: "Your query has been submitted successfully.",
    });

  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
};

// Get All Queries
export const getAllContactQueries = async (req, res) => {
  try {

    const [rows] = await db.query(
      `
      SELECT *
      FROM contact_queries
      ORDER BY created_at DESC
      `
    );

    res.json(rows);

  } catch (error) {

    console.error(error);

    res.status(500).json({
      message: "Internal Server Error",
    });

  }
};

// View Single Query
export const getContactQueryById = async (req, res) => {

  try {

    const { id } = req.params;

    const [rows] = await db.query(
      `
      SELECT *
      FROM contact_queries
      WHERE id=?
      `,
      [id]
    );

    if (!rows.length) {

      return res.status(404).json({
        message: "Query not found",
      });

    }

    res.json(rows[0]);

  } catch (error) {

    console.error(error);

    res.status(500).json({
      message: "Internal Server Error",
    });

  }

};

// Update Status
export const updateContactStatus = async (req, res) => {

  try {

    const { id } = req.params;
    const { status } = req.body;

    await db.query(
      `
      UPDATE contact_queries
      SET status=?
      WHERE id=?
      `,
      [status, id]
    );

    res.json({
      success: true,
      message: "Status Updated",
    });

  } catch (error) {

    console.error(error);

    res.status(500).json({
      message: "Internal Server Error",
    });

  }

};

// Delete Query
export const deleteContactQuery = async (req, res) => {

  try {

    const { id } = req.params;

    await db.query(
      `
      DELETE FROM contact_queries
      WHERE id=?
      `,
      [id]
    );

    res.json({
      success: true,
      message: "Query Deleted Successfully",
    });

  } catch (error) {

    console.error(error);

    res.status(500).json({
      message: "Internal Server Error",
    });

  }

};