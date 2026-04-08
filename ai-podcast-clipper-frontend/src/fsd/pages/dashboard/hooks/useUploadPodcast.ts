"use client";

import { useState } from "react";
import { toast } from "sonner";
import { generateUploadUrl } from "~/fsd/features/upload/api";
import { processVideo } from "~/fsd/features/clip/api";

async function uploadFileToS3(file: File, signedUrl: string): Promise<void> {
  const response = await fetch(signedUrl, {
    method: "PUT",
    body: file,
    headers: { "Content-Type": file.type },
  });
  if (!response.ok) throw new Error("Failed to upload file to S3");
}

export function useUploadPodcast() {
  const [isUploading, setIsUploading] = useState(false);

  const upload = async (
    file: File,
    language: string,
    clipCount: number,
  ): Promise<boolean> => {
    setIsUploading(true);
    try {
      const uploadResult = await generateUploadUrl({
        fileName: file.name,
        contentType: file.type,
        language,
      });
      if (!uploadResult.success) {
        toast.error(uploadResult.error);
        return false;
      }

      await uploadFileToS3(file, uploadResult.data.signedUrl);

      const processResult = await processVideo(
        uploadResult.data.uploadedFileId,
        language,
        clipCount,
      );
      if (!processResult.success) {
        toast.error(processResult.error);
        return false;
      }

      toast.success("Video uploaded successfully", {
        description:
          "Your video has been scheduled for processing. Check the status below",
        duration: 5000,
      });
      return true;
    } catch (error) {
      console.error("Failed to upload video", error);
      toast.error("Failed to upload video", {
        description:
          "There was a problem uploading your video. Please try again.",
      });
      return false;
    } finally {
      setIsUploading(false);
    }
  };

  return { upload, isUploading };
}
