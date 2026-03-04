import { asyncHandler } from "../utils/asyncHandler.js";
import { User } from "../models/user.model.js";
import { apiError } from "../utils/apiError.js";
import { uploadOnCloudinary } from "../utils/cloudinary.js";
import { apiResponse } from "../utils/apiResponse.js";


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
    const {username, email, password} = req.body;

    // validate
    if(!username || !email){
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
            $set : {refreshToken : undefined}
        },
        {new : true}
    )

    const options = {
        httpOnly : true,
        secure : true
    }

    return res.status(200).clearCookie("accessToken", options).clearCookie("refreshToken", options).json(
        new apiResponse(200, {}, "User logged out successfully")
    )
})

export { registerUser, loginUser, logoutUser }