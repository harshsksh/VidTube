import { asyncHandler } from "../utils/asyncHandler.js";
import { User } from "../models/user.model.js";
import { apiError } from "../utils/apiError.js";
import { uploadOnCloudinary } from "../utils/cloudinary.js";
import { apiResponse } from "../utils/apiResponse.js";

const registerUser = asyncHandler(async (req, res) => {
    // get user details from frontend
    const {username, email, password, fullname} = req.body;
    console.log("email : ", email);

    // validate
    if(!username || !email || !password || !fullname){
        throw new apiError(400, "All fields are required");
    }

    // check if user already exists
    const existingUser = await User.findOne({
        $or : [{username}, {email}]
    })

    if(existingUser){
        throw new apiError(409, "User already exists");
    }

    // check for images and avatar
    const avatarLocalPath = req.files?.avatar[0]?.path;
    const coverImageLocalPath = req.files?.coverImage[0]?.path; // optional

    if(!avatarLocalPath){
        throw new apiError(400, "Avatar is required");
    }

    // upload to  cloudinary
    const avatarUpload = await uploadOnCloudinary(avatarLocalPath);
    const coverImageUpload = await uploadOnCloudinary(coverImageLocalPath);
    
    if(!avatarUpload){
        throw new apiError(400, "Avatar upload failed");
    }

    // create user in db
    const user = await User.create({
        fullname,
        avatar : avatarUpload.url,
        coverImage : coverImageUpload?.url || "",
        email,
        password,
        username
    })

    
    // check for user creation success and remove password and refresh token from response
    const createdUser = await User.findById(user._id).select("-password -refreshToken")
    if(!createdUser){
        throw new apiError(500, "Something went wrong while registering the user");
    }

    // send response
    return res.status(201).json(
        new apiResponse(200, createdUser, "User registered successfully")
    )

    
})

export {registerUser}