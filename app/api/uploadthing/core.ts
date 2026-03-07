import { createUploadthing, type FileRouter } from "uploadthing/next";

const f = createUploadthing();

export const uploadRouter = {
    newsletterImage: f({
        image: {
            maxFileSize: "4MB",
            maxFileCount: 1,
        },
    }).onUploadComplete(async ({ file }) => {
        return {
            url: file.ufsUrl,
            name: file.name,
        };
    }),
} satisfies FileRouter;

export type OurFileRouter = typeof uploadRouter;