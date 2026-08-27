"use client";

import { useEffect, useState } from "react";
import { getNewsFeed, getNewsSources, saveNewsSources } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Newspaper, Rss, ExternalLink, RefreshCw, Settings2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

interface Article {
  source: string;
  source_type: string;
  title: string;
  summary: string;
  url: string;
  published_at: string;
}

export default function NewsPage() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [sources, setSources] = useState<any>(null);
  const [activeTab, setActiveTab] = useState("feed");
  const [saving, setSaving] = useState(false);
  const [newQuery, setNewQuery] = useState("");

  const loadNews = async () => {
    setLoading(true);
    try {
      const data: any = await getNewsFeed(8);
      setArticles(data.articles || []);
    } catch (e: any) {
      toast.error("Failed to load news");
    } finally {
      setLoading(false);
    }
  };

  const loadSources = async () => {
    try {
      const data: any = await getNewsSources();
      setSources(data);
    } catch {}
  };

  useEffect(() => {
    loadNews();
    loadSources();
  }, []);

  const toggleRssFeed = (key: string) => {
    if (!sources) return;
    const updated = { ...sources.rss_feeds };
    updated[key] = { ...updated[key], enabled: !updated[key].enabled };
    setSources({ ...sources, rss_feeds: updated });
  };

  const addRssFeed = () => {
    const name = prompt("Feed name:");
    if (!name) return;
    const url = prompt("RSS URL:");
    if (!url) return;
    const key = name.toLowerCase().replace(/[^a-z0-9]+/g, "_");
    setSources({
      ...sources,
      rss_feeds: { ...sources.rss_feeds, [key]: { name, url, enabled: true } },
    });
  };

  const removeRssFeed = (key: string) => {
    if (!confirm("Remove this feed?")) return;
    const updated = { ...sources.rss_feeds };
    delete updated[key];
    setSources({ ...sources, rss_feeds: updated });
  };

  const addYfQuery = () => {
    if (!newQuery.trim()) return;
    setSources({
      ...sources,
      yf_queries: [...(sources.yf_queries || []), newQuery.trim()],
    });
    setNewQuery("");
  };

  const removeYfQuery = (i: number) => {
    const updated = [...(sources.yf_queries || [])];
    updated.splice(i, 1);
    setSources({ ...sources, yf_queries: updated });
  };

  const saveSources = async () => {
    if (!sources) return;
    setSaving(true);
    try {
      await saveNewsSources({ rss_feeds: sources.rss_feeds, yf_queries: sources.yf_queries });
      toast.success("News sources saved");
      loadNews();
    } catch (e: any) {
      toast.error(e.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Newspaper className="h-6 w-6" /> News Feed
          </h1>
          <p className="text-sm text-muted-foreground">Aggregated Indian market news from RSS feeds + yfinance</p>
        </div>
        <Button variant="outline" size="sm" onClick={loadNews} disabled={loading}>
          {loading ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <RefreshCw className="h-3 w-3 mr-1" />}
          Refresh
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="feed">News Feed ({articles.length})</TabsTrigger>
          <TabsTrigger value="sources">
            <Settings2 className="h-3 w-3 mr-1" /> Customize Sources
          </TabsTrigger>
        </TabsList>

        {/* News Feed */}
        <TabsContent value="feed">
          {loading ? (
            <div className="py-20 text-center">
              <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
              <p className="text-xs text-muted-foreground mt-2">Fetching latest news from all sources...</p>
            </div>
          ) : articles.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center text-muted-foreground">
                No news available. Try refreshing or enable more sources.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {articles.map((a, i) => (
                <Card key={i} className="hover:shadow-sm transition-shadow">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <Badge variant="outline" className={a.source_type === "rss" ? "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/40 dark:text-orange-300 dark:border-orange-800 text-xs" : "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800 text-xs"}>
                            <Rss className="h-2.5 w-2.5 mr-1" />
                            {a.source}
                          </Badge>
                          {a.published_at && (
                            <span className="text-xs text-muted-foreground">{a.published_at}</span>
                          )}
                        </div>
                        <a
                          href={a.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-medium text-sm hover:text-primary transition-colors group flex items-start gap-1"
                        >
                          {a.title}
                          <ExternalLink className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 mt-0.5" />
                        </a>
                        {a.summary && (
                          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{a.summary}</p>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Sources */}
        <TabsContent value="sources">
          {!sources ? (
            <div className="py-10 text-center"><Loader2 className="h-5 w-5 animate-spin mx-auto" /></div>
          ) : (
            <div className="space-y-4">
              {/* RSS Feeds */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center justify-between">
                    RSS Feeds
                    <Button size="sm" variant="outline" onClick={addRssFeed}>
                      <Plus className="h-3 w-3 mr-1" /> Add Feed
                    </Button>
                  </CardTitle>
                  <p className="text-xs text-muted-foreground">
                    Indian financial news sources. Toggle to enable/disable. Add your own RSS URLs.
                  </p>
                </CardHeader>
                <CardContent className="space-y-2">
                  {Object.entries(sources.rss_feeds).map(([key, info]: any) => (
                    <div key={key} className="flex items-center justify-between p-3 rounded-lg border">
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <input
                          type="checkbox"
                          checked={info.enabled}
                          onChange={() => toggleRssFeed(key)}
                          className="h-4 w-4"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-sm">{info.name}</p>
                          <p className="text-xs text-muted-foreground truncate font-mono">{info.url}</p>
                        </div>
                      </div>
                      <Button size="sm" variant="ghost" onClick={() => removeRssFeed(key)} className="text-red-600 hover:text-red-700">
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </CardContent>
              </Card>

              {/* yfinance queries */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">yfinance Search Queries</CardTitle>
                  <p className="text-xs text-muted-foreground">
                    Queries used to find market news via yfinance. Add Indian-market specific searches here.
                  </p>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex gap-2">
                    <Input
                      value={newQuery}
                      onChange={(e) => setNewQuery(e.target.value)}
                      placeholder="e.g., NIFTY IT sector outlook"
                      onKeyDown={(e) => e.key === "Enter" && addYfQuery()}
                    />
                    <Button size="sm" onClick={addYfQuery}><Plus className="h-3 w-3 mr-1" /> Add</Button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {(sources.yf_queries || []).map((q: string, i: number) => (
                      <Badge key={i} variant="outline" className="text-xs">
                        {q}
                        <button onClick={() => removeYfQuery(i)} className="ml-2 hover:text-red-600">
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <div className="flex justify-end">
                <Button onClick={saveSources} disabled={saving}>
                  {saving ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                  Save Changes
                </Button>
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
