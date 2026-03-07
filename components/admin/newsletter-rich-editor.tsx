"use client";

import { useEffect, useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import Underline from "@tiptap/extension-underline";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import { Placeholder } from "@tiptap/extensions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { UploadButton } from "@/lib/uploadthing";

type Props = {
    value: string;
    onChange: (html: string) => void;
    placeholder?: string;
    className?: string;
};

export const NewsletterRichEditor = ({
                                         value,
                                         onChange,
                                         placeholder,
                                         className,
                                     }: Props) => {
    const [link, setLink] = useState("");

    const editor = useEditor({
        immediatelyRender: false,
        extensions: [
            StarterKit.configure({
                heading: { levels: [1, 2, 3] },
                bulletList: { keepMarks: true, keepAttributes: false },
                orderedList: { keepMarks: true, keepAttributes: false },
            }),
            Underline,
            Link.configure({
                openOnClick: false,
                autolink: true,
                linkOnPaste: true,
                HTMLAttributes: {
                    rel: "noopener noreferrer",
                    target: "_blank",
                },
            }),
            Image.configure({
                inline: false,
                allowBase64: false,
                HTMLAttributes: {
                    class: "my-4 rounded-md max-w-full h-auto",
                },
            }),
            Placeholder.configure({
                placeholder: placeholder ?? "Write your newsletter...",
            }),
        ],
        content: value || "<p></p>",
        onUpdate: ({ editor }) => {
            onChange(editor.getHTML());
        },
        editorProps: {
            attributes: {
                class:
                    "prose prose-sm dark:prose-invert max-w-none focus:outline-none min-h-[260px] px-3 py-2",
            },
        },
    });

    useEffect(() => {
        if (!editor) return;

        const current = editor.getHTML();

        if (value && value !== current) {
            editor.commands.setContent(value, { emitUpdate: false });
        }

        if (!value && current !== "<p></p>") {
            editor.commands.setContent("<p></p>", { emitUpdate: false });
        }
    }, [value, editor]);

    if (!editor) return null;

    const setOrUnsetLink = () => {
        const url = link.trim();

        if (!url) {
            editor.chain().focus().extendMarkRange("link").unsetLink().run();
            return;
        }

        editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
    };

    return (
        <div className={["w-full rounded-md border bg-background", className].filter(Boolean).join(" ")}>
            <div className="flex flex-wrap items-center gap-1 p-2">
                <Button
                    type="button"
                    variant={editor.isActive("bold") ? "default" : "secondary"}
                    size="sm"
                    onClick={() => editor.chain().focus().toggleBold().run()}
                >
                    Bold
                </Button>

                <Button
                    type="button"
                    variant={editor.isActive("italic") ? "default" : "secondary"}
                    size="sm"
                    onClick={() => editor.chain().focus().toggleItalic().run()}
                >
                    Italic
                </Button>

                <Button
                    type="button"
                    variant={editor.isActive("underline") ? "default" : "secondary"}
                    size="sm"
                    onClick={() => editor.chain().focus().toggleUnderline().run()}
                >
                    Underline
                </Button>

                <Separator orientation="vertical" className="mx-1 h-8" />

                <Button
                    type="button"
                    variant={editor.isActive("heading", { level: 1 }) ? "default" : "secondary"}
                    size="sm"
                    onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
                >
                    H1
                </Button>

                <Button
                    type="button"
                    variant={editor.isActive("heading", { level: 2 }) ? "default" : "secondary"}
                    size="sm"
                    onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
                >
                    H2
                </Button>

                <Button
                    type="button"
                    variant={editor.isActive("heading", { level: 3 }) ? "default" : "secondary"}
                    size="sm"
                    onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
                >
                    H3
                </Button>

                <Separator orientation="vertical" className="mx-1 h-8" />

                <Button
                    type="button"
                    variant={editor.isActive("bulletList") ? "default" : "secondary"}
                    size="sm"
                    onClick={() => editor.chain().focus().toggleBulletList().run()}
                >
                    Bullets
                </Button>

                <Button
                    type="button"
                    variant={editor.isActive("orderedList") ? "default" : "secondary"}
                    size="sm"
                    onClick={() => editor.chain().focus().toggleOrderedList().run()}
                >
                    Numbered
                </Button>

                <Separator orientation="vertical" className="mx-1 h-8" />

                <div className="flex items-center gap-2">
                    <Input
                        value={link}
                        onChange={(e) => setLink(e.target.value)}
                        placeholder="https://..."
                        className="h-9 w-[220px]"
                    />
                    <Button type="button" variant="secondary" size="sm" onClick={setOrUnsetLink}>
                        Set link
                    </Button>
                    <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => editor.chain().focus().extendMarkRange("link").unsetLink().run()}
                    >
                        Unlink
                    </Button>
                </div>

                <Separator orientation="vertical" className="mx-1 h-8" />

                <UploadButton
                    endpoint="newsletterImage"
                    appearance={{
                        button: "h-9 rounded-md px-3 text-sm font-medium",
                    }}
                    content={{
                        button() {
                            return "Upload image";
                        },
                    }}
                    onClientUploadComplete={(files: any) => {
                        const file = files[0];
                        if (!file?.ufsUrl) return;

                        editor
                            .chain()
                            .focus()
                            .setImage({
                                src: file.ufsUrl,
                                alt: file.name ?? "Newsletter image",
                            })
                            .run();
                    }}
                    onUploadError={(error: Error) => {
                        console.error(error);
                    }}
                />

                <div className="ml-auto flex items-center gap-1">
                    <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => editor.chain().focus().undo().run()}
                        disabled={!editor.can().undo()}
                    >
                        Undo
                    </Button>
                    <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => editor.chain().focus().redo().run()}
                        disabled={!editor.can().redo()}
                    >
                        Redo
                    </Button>
                </div>
            </div>

            <Separator />

            <EditorContent editor={editor} />
        </div>
    );
};