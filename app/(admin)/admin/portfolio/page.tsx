import { FormHeader } from "@/components/header";
import { UserRound } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PortfolioPostsTable } from "@/components/admin/portfolio-posts-table";
import { PortfolioProjectsTable } from "@/components/admin/portfolio-projects-table";
import { PortfolioSettingsForm } from "@/components/admin/portfolio-settings-form";

// Portfolio management tab. Backs Luke's personal site (luketaylor.io): blog
// posts, projects, and site settings, all DB-backed and served to the portfolio
// app via the public read-only /api/portfolio/* endpoints.
export default function PortfolioPage() {
    return (
        <div className="max-w-4xl mx-auto pt-12 pb-16 px-4">
            <div className="space-y-4">
                <FormHeader
                    icon={<UserRound />}
                    title="Portfolio"
                    description="Manage luketaylor.io — write blog posts, curate projects, and edit your hero/about/links. Published changes go live on the portfolio within about a minute."
                />

                <Tabs defaultValue="posts" className="w-full">
                    <TabsList>
                        <TabsTrigger value="posts">Blog</TabsTrigger>
                        <TabsTrigger value="projects">Projects</TabsTrigger>
                        <TabsTrigger value="settings">Site settings</TabsTrigger>
                    </TabsList>
                    <TabsContent value="posts" className="pt-4">
                        <PortfolioPostsTable />
                    </TabsContent>
                    <TabsContent value="projects" className="pt-4">
                        <PortfolioProjectsTable />
                    </TabsContent>
                    <TabsContent value="settings" className="pt-4">
                        <PortfolioSettingsForm />
                    </TabsContent>
                </Tabs>
            </div>
        </div>
    );
}
