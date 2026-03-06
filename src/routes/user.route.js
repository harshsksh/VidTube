import { Router } from "express";
import { registerUser, loginUser, logoutUser, refreshToken, changePassword, getCurrentUser, updateProfile, updateAvatar, updateCoverImage, getUserChannelProfile, getWatchHistory } from "../controllers/user.controller.js";
import {upload} from "../middlewares/multer.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";

const router = Router();

router.route("/register").post(
    upload.fields([
        {
            name : "avatar",
            maxCount : 1
        },
        {
            name : "coverImage",
            maxCount : 1
        }
    ]),
    registerUser
)

router.route("/login").post(loginUser)

// secure routes
router.route("/logout").post(verifyJWT, logoutUser)

router.route("/refresh-token").post(refreshToken)

router.route("/change-password").post(verifyJWT, changePassword)

router.route("/get-current-user").get(verifyJWT, getCurrentUser)

router.route("/update-profile").patch(verifyJWT, updateProfile)

router.route("/update-avatar").patch(verifyJWT, upload.single("avatar"), updateAvatar)

router.route("/update-cover-image").patch(verifyJWT, upload.single("coverImage"), updateCoverImage)

router.route("/get-user-channel-profile").get(verifyJWT, getUserChannelProfile)

router.route("/get-watch-history").get(verifyJWT, getWatchHistory)

export default router;