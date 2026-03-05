import { asyncHandler } from "../utils/asyncHandler.js";
import { User } from "../models/user.model.js";
import { apiError } from "../utils/apiError.js";
import { uploadOnCloudinary } from "../utils/cloudinary.js";
import { apiResponse } from "../utils/apiResponse.js";
import jwt from "jsonwebtoken";


const generateAccessAndRefreshTokens = async(userId) => {
    try{
        const user = await User.findById(userId);
        const accessToken = user.generateAccessToken();
        const refreshToken = user.generateRefreshToken();

        user.refreshToken = refreshToken;
        await user.save({validateBeforeSave : false});

        return {accessToken, refreshToken}; 
    }
    catch(error){
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

const loginUser = asyncHandler(async(req, res) => {
    // get user details from frontend
    const {username, email, password} = req.body || {};

    // validate
    if(!(username || email)){
        throw new apiError(400, "username or emial is required")
    }

    // check if user exists
    const existingUser = await User.findOne({
        $or : [{username}, {email}]
    })
    if(!existingUser){
        throw new apiError(404, "User not found")
    }

    // check if password is correct
    const isPasswordValid = await existingUser.isPasswordCorrect(password);
    if(!isPasswordValid){
        throw new apiError(401, "Invalid credentials : password is incorrect")
    }

    // generate access and refresh tokens
    const {accessToken, refreshToken} = await generateAccessAndRefreshTokens(existingUser._id);

    const loggedUser = await User.findById(existingUser._id).select("-password -refreshToken");
    
    // send cookies
    const options = {
        httpOnly : true,
        secure : true 
    }
    return res.status(200).cookie("accessToken", accessToken, options).cookie("refreshToken", refreshToken, options).json(
        new apiResponse(200, loggedUser, "User logged in successfully")
    )
    
})

const logoutUser = asyncHandler(async(req, res) => {
    await User.findByIdAndUpdate(
    req.user._id,
    {
        $unset: { refreshToken: 1 }  // properly removes the field
    },
    { returnDocument: "after" }      // replaces new: true
)

    const options = {
        httpOnly : true,
        secure : true
    }

    return res.status(200).clearCookie("accessToken", options).clearCookie("refreshToken", options).json(
        new apiResponse(200, {}, "User logged out successfully")
    )
})

// refresh access token
const refreshToken = asyncHandler(async(req, res) => {
    const incomingRefreshToken = req.cookies?.refreshToken || req.body?.refreshToken;

    if(!incomingRefreshToken){
        throw new apiError(401, "Unauthorized request : refresh token not found")
    }

    try {
        const decoded = jwt.verify(incomingRefreshToken, process.env.REFRESH_TOKEN_SECRET);
    
        const user = await User.findById(decoded._id);
    
        if(!user){
            throw new apiError(401, "Invalid refresh token")
        }
    
        if(incomingRefreshToken !== user.refreshToken){
            throw new apiError(401, "refresh token is expired or used")
        }
    
        const options = {
            httpOnly : true,
            secure : true
        }
    
        const {accessToken, refreshToken} = await generateAccessAndRefreshTokens(user._id);
    
        return res.status(200).cookie("accessToken", accessToken, options).cookie("refreshToken", refreshToken,options).json(
            new apiResponse(200, {accessToken, refreshToken}, "Access token generated successfully")
        )
        
    } catch (error) {
        throw new apiError(401, error?.message || "Invalid refresh token")
    }
})

const changePassword = asyncHandler(async(req, res) => {
    const {oldPassword, newPassword} = req.body;

    if(!oldPassword || !newPassword){
        throw new apiError(400, "All fields are required")
    }

    const user = await User.findById(req.user?._id);
    if(!user){
        throw new apiError(404, "user not found");
    }

    const isPasswordCorrect = await user.isPasswordCorrect(oldPassword);

    if(!isPasswordCorrect){
        throw new apiError(401, "Invalid password");
    }

    user.password = newPassword;

    await user.save({validateBeforeSave : false});

    return res.status(200).json(
        new apiResponse(200, {}, "Password changed successfully")
    )

})

const getCurrentUser = asyncHandler(async(req, res) => {
    return res.status(200).json(
        new apiResponse(200, req.user, "User fetched successfully")
    )
})

const updateProfile = asyncHandler(async(req, res) => {
    const {fullname, email} = req.body;
    if(!fullname || !email){
        throw new apiError(400, "All fiels are required");
    }

    const user = await User.findByIdAndUpdate(
        req.user?._id,
        {
            $set : {
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

const updateAvatar = asyncHandler(async(req, res) => {
    const avatarLocalPath = req.file?.path;
    if(!avatarLocalPath){
        throw new apiError(400, "Avatar file is missing");
    }

    const avatarUpload = await uploadOnCloudinary(avatarLocalPath);
    if(!avatarUpload.url){
        throw new apiError(400, "Error while uploading avatar")
    }

    const user = await User.findByIdAndUpdate(
        req.user?._id,
        {
            $set : {
                avatar : avatarUpload.url
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

const updateCoverImage = asyncHandler(async(req, res) => {
    const coverImageLocalPath = req.file?.path;
    if(!coverImageLocalPath){
        throw new apiError(400, "Cover image file is missing");
    }

    const coverImageUpload = await uploadOnCloudinary(coverImageLocalPath);
    if(!coverImageUpload.url){
        throw new apiError(400, "Error while uploading cover image")
    }

    const user = await User.findByIdAndUpdate(
        req.user?._id,
        {
            $set : {
                coverImage : coverImageUpload.url
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

export { registerUser, loginUser, logoutUser, refreshToken, changePassword, getCurrentUser, updateProfile, updateAvatar, updateCoverImage }