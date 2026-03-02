import { v2 as cloudinary } from "cloudinary";
import fs from "fs";

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});

const uploadOnCloudinary = async (localFilePath) => {
    try {

        if (!localFilePath) return null;

        const response = await cloudinary.uploader.upload(localFilePath, {
            resource_type: "auto",
        });

        // file uploaded successfully
        console.log("file is uploaded on cloudinary", response.url);

        //  remove local temp file
        fs.unlinkSync(localFilePath);
        return response;

    } catch (error) {
        // remove the locally saved temp file if upload fails
        fs.unlinkSync(localFilePath);
        return null;
    }
};

// const deleteFromCloudinary = async (publicId) => {
//     try {
//         if (!publicId) return null;
//         const result = await cloudinary.uploader.destroy(publicId);
//         return result;
//     } catch (error) {
//         return null;
//     }
// };

export { uploadOnCloudinary };
