import { asyncHandler } from "../utils/asyncHandler.js";
import { User } from "../models/user.model.js";
import { apiError } from "../utils/apiError.js";
import { uploadOnCloudinary } from "../utils/cloudinary.js";
import { apiResponse } from "../utils/apiResponse.js";
import jwt from "jsonwebtoken";
import { Subscription } from "../models/subscription.model.js";
import { Video } from "../models/video.model.js";
import mongoose from "mongoose";


const generateAccessAndRefreshTokens = async (userId) => {
    try {
        const user = await User.findById(userId);
        const accessToken = user.generateAccessToken();
        const refreshToken = user.generateRefreshToken();

        user.refreshToken = refreshToken;
        await user.save({ validateBeforeSave: false });

        return { accessToken, refreshToken };
    }
    catch (error) {
        throw new apiError(500, "Something went wrong while generating access and refresh tokens");
    }
}

const registerUser = asyncHandler(async (req, res) => {
    // get user details from frontend
    const { username, email, password, fullname } = req.body;
    console.log("email : ", email);

    // validate
    if (!username || !email || !password || !fullname) {
        throw new apiError(400, "All fields are required");
    }

    // check if user already exists
    const existingUser = await User.findOne({
        $or: [{ username }, { email }]
    })

    if (existingUser) {
        throw new apiError(409, "User already exists");
    }

    // check for images and avatar
    const avatarLocalPath = req.files?.avatar?.[0]?.path;
    const coverImageLocalPath = req.files?.coverImage?.[0]?.path; // optional

    if (!avatarLocalPath) {
        throw new apiError(400, "Avatar is required");
    }

    // upload to  cloudinary
    const avatarUpload = await uploadOnCloudinary(avatarLocalPath);
    const coverImageUpload = coverImageLocalPath ? await uploadOnCloudinary(coverImageLocalPath) : null;

    if (!avatarUpload) {
        throw new apiError(400, "Avatar file upload failed");
    }

    // create user in db
    const user = await User.create({
        fullname,
        avatar: avatarUpload.url,
        coverImage: coverImageUpload?.url || "",
        email,
        password,
        username
    })


    // check for user creation success and remove password and refresh token from response
    const createdUser = await User.findById(user._id).select("-password -refreshToken")
    if (!createdUser) {
        throw new apiError(500, "Something went wrong while registering the user");
    }

    // send response
    return res.status(201).json(
        new apiResponse(200, createdUser, "User registered successfully")
    )


})

const loginUser = asyncHandler(async (req, res) => {
    // get user details from frontend
    const { username, email, password } = req.body || {};

    // validate
    if (!(username || email)) {
        throw new apiError(400, "username or email is required")
    }

    // check if user exists
    const existingUser = await User.findOne({
        $or: [{ username }, { email }]
    })
    if (!existingUser) {
        throw new apiError(404, "User not found")
    }

    // check if password is correct
    const isPasswordValid = await existingUser.isPasswordCorrect(password);
    if (!isPasswordValid) {
        throw new apiError(401, "Invalid credentials : password is incorrect")
    }

    // generate access and refresh tokens
    const { accessToken, refreshToken } = await generateAccessAndRefreshTokens(existingUser._id);

    const loggedUser = await User.findById(existingUser._id).select("-password -refreshToken");

    // send cookies
    const options = {
        httpOnly: true,
        secure: true
    }
    return res.status(200).cookie("accessToken", accessToken, options).cookie("refreshToken", refreshToken, options).json(
        new apiResponse(200, loggedUser, "User logged in successfully")
    )

})

const logoutUser = asyncHandler(async (req, res) => {
    await User.findByIdAndUpdate(
        req.user._id,
        {
            $unset: { refreshToken: 1 }  // properly removes the field
        },
    { returnDocument: "after" }      // replaces new: true
    )

    const options = {
        httpOnly: true,
        secure: true
    }

    return res.status(200).clearCookie("accessToken", options).clearCookie("refreshToken", options).json(
        new apiResponse(200, {}, "User logged out successfully")
    )
})

// refresh access token
const refreshToken = asyncHandler(async (req, res) => {
    const incomingRefreshToken = req.cookies?.refreshToken || req.body?.refreshToken;

    if (!incomingRefreshToken) {
        throw new apiError(401, "Unauthorized request : refresh token not found")
    }

    try {
        const decoded = jwt.verify(incomingRefreshToken, process.env.REFRESH_TOKEN_SECRET);

        const user = await User.findById(decoded._id);

        if (!user) {
            throw new apiError(401, "Invalid refresh token")
        }

        if (incomingRefreshToken !== user.refreshToken) {
            throw new apiError(401, "refresh token is expired or used")
        }

        const options = {
            httpOnly: true,
            secure: true
        }

        const { accessToken, refreshToken } = await generateAccessAndRefreshTokens(user._id);

        return res.status(200).cookie("accessToken", accessToken, options).cookie("refreshToken", refreshToken, options).json(
            new apiResponse(200, { accessToken, refreshToken }, "Access token generated successfully")
        )

    } catch (error) {
        throw new apiError(401, error?.message || "Invalid refresh token")
    }
})

const changePassword = asyncHandler(async (req, res) => {
    const { oldPassword, newPassword } = req.body;

    if (!oldPassword || !newPassword) {
        throw new apiError(400, "All fields are required")
    }

    const user = await User.findById(req.user?._id);
    if (!user) {
        throw new apiError(404, "user not found");
    }

    const isPasswordCorrect = await user.isPasswordCorrect(oldPassword);

    if (!isPasswordCorrect) {
        throw new apiError(401, "Invalid password");
    }

    user.password = newPassword;

    await user.save({ validateBeforeSave: false });

    return res.status(200).json(
        new apiResponse(200, {}, "Password changed successfully")
    )

})

const getCurrentUser = asyncHandler(async (req, res) => {
    return res.status(200).json(
        new apiResponse(200, req.user, "User fetched successfully")
    )
})

const updateProfile = asyncHandler(async (req, res) => {
    const { fullname, email } = req.body;
    if (!fullname || !email) {
        throw new apiError(400, "All fields are required");
    }

    const user = await User.findByIdAndUpdate(
        req.user?._id,
        {
            $set: {
                fullname,
                email
            }
        },
        {
            returnDocument : "after"
        }
    ).select("-password -refreshToken");

    return res.status(200).json(
        new apiResponse(200, user, "Profile updated successfully")
    )

})

const updateAvatar = asyncHandler(async (req, res) => {
    const avatarLocalPath = req.file?.path;
    if (!avatarLocalPath) {
        throw new apiError(400, "Avatar file is missing");
    }

    const avatarUpload = await uploadOnCloudinary(avatarLocalPath);
    if (!avatarUpload || !avatarUpload.url) {
        throw new apiError(400, "Error while uploading avatar")
    }

    const user = await User.findByIdAndUpdate(
        req.user?._id,
        {
            $set: {
                avatar: avatarUpload.url
            }
        },
        {
            returnDocument : "after"
        }
    ).select("-password -refreshToken")

    return res.status(200).json(
        new apiResponse(200, user, "Avatar updated successfully")
    )
})

const updateCoverImage = asyncHandler(async (req, res) => {
    const coverImageLocalPath = req.file?.path;
    if (!coverImageLocalPath) {
        throw new apiError(400, "Cover image file is missing");
    }

    const coverImageUpload = await uploadOnCloudinary(coverImageLocalPath);
    if(!coverImageUpload.url){
        throw new apiError(400, "Error while uploading cover image")
    }

    const user = await User.findByIdAndUpdate(
        req.user?._id,
        {
            $set: {
                coverImage: coverImageUpload.url
            }
        },
        {
            returnDocument : "after"
        }
    ).select("-password -refreshToken")

    return res.status(200).json(
        new apiResponse(200, user, "Cover image updated successfully")
    )
})

const getUserChannelProfile = asyncHandler(async (req, res) => {
    const { username } = req.params;

    if (!username) {
        throw new apiError(400, "username is missing")
    }

    const channelProfile = await User.aggregate([
        {
            $match: {
                username: username?.toLowerCase()
            }
        },
        {
            $lookup: {
                from: "subscriptions",
                localField: "_id",
                foreignField: "channel",
                as: "subscribers"
            }
        },
        {
            $lookup: {
                from: "subscriptions",
                localField: "_id",
                foreignField: "subscriber",
                as: "subscribedTo"
            }
        },
        {
            $addFields: {
                subscribersCount: {
                    $size: "$subscribers"
                },
                subscribedToCount: {
                    $size: "$subscribedTo"
                },
                isSubscribed: {
                    $cond: {
                        if: {
                            $in: [req.user?._id, "$subscribers.subscriber"]
                        },
                        then: true,
                        else: false
                    }
                }
            }
        },
        {
            $project: {
                username: 1,
                fullname: 1,
                avatar: 1,
                coverImage: 1,
                subscribersCount: 1,
                subscribedToCount: 1,
                isSubscribed: 1
            }
        }
    ])

    if (!channelProfile?.length) {
        throw new apiError(404, "Channel not found");
    }

    return res.status(200).json(
        new apiResponse(200, channelProfile[0], "Channel profile fetched successfully")
    )
})

const getWatchHistory = asyncHandler(async(req, res) => {
    const user = await User.aggregate([
        {
            $match: {
                _id : new mongoose.Types.ObjectId(req.user?._id)
            }
        },
        {
            $lookup : {
                from : "videos",
                localField : "watchHistory",
                foreignField : "_id",
                as : "watchHistory",
                pipeline : [
                    {
                        $lookup : {
                            from : "users",
                            localField : "owner",
                            foreignField : "_id",
                            as : "owner",
                            pipeline : [
                                {
                                    $project : {
                                        username : 1,
                                        fullname : 1,
                                        avatar : 1
                                    }
                                }
                            ]
                        }
                    },
                    {
                        $addFields : {
                            owner : {
                                $first : "$owner"
                            }
                        }
                    }
                ]
            }
        }
    ])

    return res.status(200).json(
        new apiResponse(200, user, "Watch history fetched successfully")
    )
})

export { registerUser, loginUser, logoutUser, refreshToken, changePassword, getCurrentUser, updateProfile, updateAvatar, updateCoverImage, getUserChannelProfile, getWatchHistory }