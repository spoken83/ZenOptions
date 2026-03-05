import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Play, BookOpen, Lightbulb, TrendingUp, Calendar, FileText } from "lucide-react";

interface Resource {
  id: string;
  title: string;
  description: string;
  type: "video" | "article";
  category: "product-demos" | "trade-ideas" | "educational" | "trade-of-the-day" | "articles";
  youtubeId?: string;
  articleUrl?: string;
  duration?: string;
  date: string;
}

const resources: Resource[] = [
  {
    id: "1",
    title: "ZenOptions Product Demo",
    description: "A quick walkthrough of ZenOptions - your options trading companion for Credit Spreads, Iron Condors, and LEAPS. See how the scanner, position tracking, and ZenStatus guidance work together.",
    type: "video",
    category: "product-demos",
    youtubeId: "dWN65UVLOwE",
    duration: "5:00",
    date: "2024-12-07",
  },
  {
    id: "2",
    title: "Options Trading Fundamentals",
    description: "Learn the core concepts of options trading including calls, puts, and basic strategies to get started on your trading journey.",
    type: "video",
    category: "educational",
    youtubeId: "663KA-c1LT8",
    date: "2024-12-11",
  },
];

const categories = [
  { id: "all", label: "All", icon: BookOpen },
  { id: "product-demos", label: "Product Demos", icon: Play },
  { id: "trade-ideas", label: "Trade Ideas", icon: Lightbulb },
  { id: "educational", label: "Educational", icon: BookOpen },
  { id: "trade-of-the-day", label: "Trade of the Day", icon: TrendingUp },
  { id: "articles", label: "Articles", icon: FileText },
];

function getYouTubeThumbnail(youtubeId: string): string {
  return `https://img.youtube.com/vi/${youtubeId}/maxresdefault.jpg`;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function Resources() {
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [selectedVideo, setSelectedVideo] = useState<Resource | null>(null);

  const filteredResources = selectedCategory === "all"
    ? resources
    : resources.filter((r) => r.category === selectedCategory);

  const getCategoryLabel = (category: string) => {
    return categories.find((c) => c.id === category)?.label || category;
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container max-w-6xl mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2" data-testid="resources-title">Resources</h1>
          <p className="text-muted-foreground">
            Videos, tutorials, and insights to help you trade smarter with ZenOptions.
          </p>
        </div>

        <Tabs value={selectedCategory} onValueChange={setSelectedCategory} className="mb-8">
          <TabsList className="flex flex-wrap h-auto gap-2 bg-transparent p-0">
            {categories.map((category) => {
              const Icon = category.icon;
              return (
                <TabsTrigger
                  key={category.id}
                  value={category.id}
                  className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground px-4 py-2 rounded-full border"
                  data-testid={`tab-${category.id}`}
                >
                  <Icon className="w-4 h-4 mr-2" />
                  {category.label}
                </TabsTrigger>
              );
            })}
          </TabsList>

          <TabsContent value={selectedCategory} className="mt-6">
            {filteredResources.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground">
                <BookOpen className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p className="text-lg">No resources in this category yet.</p>
                <p className="text-sm">Check back soon for new content!</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredResources.map((resource) => (
                  <Card
                    key={resource.id}
                    className="overflow-hidden cursor-pointer hover:shadow-lg transition-shadow group"
                    onClick={() => resource.type === "video" && setSelectedVideo(resource)}
                    data-testid={`resource-card-${resource.id}`}
                  >
                    {resource.type === "video" && resource.youtubeId && (
                      <div className="relative aspect-video bg-muted">
                        <img
                          src={getYouTubeThumbnail(resource.youtubeId)}
                          alt={resource.title}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            (e.target as HTMLImageElement).src = `https://img.youtube.com/vi/${resource.youtubeId}/hqdefault.jpg`;
                          }}
                        />
                        <div className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                          <div className="w-16 h-16 rounded-full bg-white/90 flex items-center justify-center">
                            <Play className="w-8 h-8 text-primary fill-primary ml-1" />
                          </div>
                        </div>
                        {resource.duration && (
                          <div className="absolute bottom-2 right-2 bg-black/80 text-white text-xs px-2 py-1 rounded">
                            {resource.duration}
                          </div>
                        )}
                      </div>
                    )}
                    <CardContent className="p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <Badge variant="secondary" className="text-xs">
                          {getCategoryLabel(resource.category)}
                        </Badge>
                        <span className="text-xs text-muted-foreground flex items-center">
                          <Calendar className="w-3 h-3 mr-1" />
                          {formatDate(resource.date)}
                        </span>
                      </div>
                      <h3 className="font-semibold mb-2 line-clamp-2" data-testid={`resource-title-${resource.id}`}>
                        {resource.title}
                      </h3>
                      <p className="text-sm text-muted-foreground line-clamp-3">
                        {resource.description}
                      </p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      <Dialog open={!!selectedVideo} onOpenChange={() => setSelectedVideo(null)}>
        <DialogContent className="max-w-4xl p-0 overflow-hidden bg-black">
          <DialogTitle className="sr-only">
            {selectedVideo?.title || "Video Player"}
          </DialogTitle>
          {selectedVideo?.youtubeId && (
            <div className="aspect-video">
              <iframe
                src={`https://www.youtube.com/embed/${selectedVideo.youtubeId}?autoplay=1&rel=0`}
                title={selectedVideo.title}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                className="w-full h-full"
                data-testid="youtube-player"
              />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
