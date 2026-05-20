const express = require("express");
const artworkService = require("../services/artwork.service");
const { ApiError } = require("../utils/api-error");

const router = express.Router();

function asyncHandler(handler) {
  return async (req, res, next) => {
    try {
      await handler(req, res, next);
    } catch (error) {
      next(error);
    }
  };
}

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const title = (req.query.title || "").toString().trim();
    if (!title) {
      throw new ApiError(400, "Se requiere el parametro title");
    }

    const baseUrl = `${req.protocol}://${req.get("host")}`;
    const data = await artworkService.resolveArtwork(title, baseUrl);

    res.status(200).json({
      success: true,
      data,
    });
  })
);

module.exports = router;
