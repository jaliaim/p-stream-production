import React, { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { get } from "@/backend/metadata/tmdb";
import { conf } from "@/setup/config";
import { useLanguageStore } from "@/stores/language";
import { getTmdbLanguageCode } from "@/utils/language";
import { useDiscoverOptions } from "@/pages/discover/hooks/useDiscoverMedia";
import { WideContainer } from "@/components/layout/WideContainer";
import { MediaCard } from "@/components/media/MediaCard";
import { MediaGrid } from "@/components/media/MediaGrid";
import { Dropdown, OptionItem } from "@/components/form/Dropdown";
import { MediaItem } from "@/utils/mediaTypes";

interface FiltersTabProps {
  onShowDetails?: (media: MediaItem) => void;
}

interface TMDBDiscoverResult {
  results: Array<{
    id: number;
    title?: string;
    name?: string;
    poster_path: string | null;
    release_date?: string;
    first_air_date?: string;
    vote_average?: number;
  }>;
  total_pages: number;
}

const SKELETON_KEYS: string[] = [
  "sk-a",
  "sk-b",
  "sk-c",
  "sk-d",
  "sk-e",
  "sk-f",
  "sk-g",
  "sk-h",
  "sk-i",
  "sk-j",
  "sk-k",
  "sk-l",
];

export function FiltersTab({ onShowDetails }: FiltersTabProps) {
  const { t } = useTranslation();

  // State
  const [mediaType, setMediaType] = useState<OptionItem>({
    id: "movie",
    name: t("discover.filters.mediaType.movie", { defaultValue: "Movies" }),
  });
  const [year, setYear] = useState<OptionItem>({
    id: "",
    name: t("discover.filters.anyYear", { defaultValue: "Any Year" }),
  });
  const [genre, setGenre] = useState<OptionItem>({
    id: "",
    name: t("discover.filters.anyGenre", { defaultValue: "Any Genre" }),
  });
  const [provider, setProvider] = useState<OptionItem>({
    id: "",
    name: t("discover.filters.anyProvider", {
      defaultValue: "Any Provider",
    }),
  });
  const [country, setCountry] = useState<OptionItem>({
    id: "US",
    name: t("discover.filters.countryDefault", {
      defaultValue: "United States",
    }),
  });
  const [rating, setRating] = useState<OptionItem>({
    id: "",
    name: t("discover.filters.anyRating", { defaultValue: "Any Rating" }),
  });
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [items, setItems] = useState<MediaItem[]>([]);

  const userLanguage = useLanguageStore((s) => s.language);
  const formattedLanguage = getTmdbLanguageCode(userLanguage);

  // Options sourced from TMDB and static lists
  const selectedMediaType = mediaType.id as "movie" | "tv";
  const { providers, genres } = useDiscoverOptions(selectedMediaType);

  const mediaTypeOptions: OptionItem[] = useMemo(
    () => [
      {
        id: "movie",
        name: t("discover.filters.mediaType.movie", { defaultValue: "Movies" }),
      },
      {
        id: "tv",
        name: t("discover.filters.mediaType.tv", { defaultValue: "TV Shows" }),
      },
    ],
    [t],
  );

  const yearOptions: OptionItem[] = useMemo(() => {
    const current = new Date().getFullYear();
    const years: OptionItem[] = [
      { id: "", name: t("discover.filters.anyYear", { defaultValue: "Any Year" }) },
    ];
    for (let y = current; y >= 1950; y -= 1)
      years.push({ id: String(y), name: String(y) });
    return years;
  }, [t]);

  const genreOptions: OptionItem[] = useMemo(
    () => [
      { id: "", name: t("discover.filters.anyGenre", { defaultValue: "Any Genre" }) },
      ...genres.map((g) => ({ id: String(g.id), name: g.name })),
    ],
    [genres, t],
  );

  const providerOptions: OptionItem[] = useMemo(
    () => [
      {
        id: "",
        name: t("discover.filters.anyProvider", { defaultValue: "Any Provider" }),
      },
      ...providers.map((p) => ({ id: p.id, name: p.name })),
    ],
    [providers, t],
  );

  // Minimal country list for watch_region (ISO-3166-1)
  const countryOptions: OptionItem[] = useMemo(
    () => [
      { id: "US", name: t("countries.us", { defaultValue: "United States" }) },
      { id: "GB", name: t("countries.gb", { defaultValue: "United Kingdom" }) },
      { id: "CA", name: t("countries.ca", { defaultValue: "Canada" }) },
      { id: "AU", name: t("countries.au", { defaultValue: "Australia" }) },
      { id: "DE", name: t("countries.de", { defaultValue: "Germany" }) },
      { id: "FR", name: t("countries.fr", { defaultValue: "France" }) },
      { id: "IN", name: t("countries.in", { defaultValue: "India" }) },
    ],
    [t],
  );

  const ratingOptions: OptionItem[] = useMemo(
    () => [
      { id: "", name: t("discover.filters.anyRating", { defaultValue: "Any Rating" }) },
      { id: "9", name: "9+" },
      { id: "8", name: "8+" },
      { id: "7", name: "7+" },
      { id: "6", name: "6+" },
    ],
    [t],
  );

  // Build TMDB discover endpoint and params
  const endpoint = useMemo(
    () => (selectedMediaType === "movie" ? "/discover/movie" : "/discover/tv"),
    [selectedMediaType],
  );

  const params = useMemo(() => {
    const p: Record<string, any> = {
      api_key: conf().TMDB_READ_API_KEY,
      language: formattedLanguage,
      page: String(page),
      sort_by: "popularity.desc",
      include_adult: false,
    };

    if (genre.id) p.with_genres = genre.id;
    if (provider.id) {
      p.with_watch_providers = provider.id;
      p.watch_region = country.id || "US";
    }
    if (country.id) p.region = country.id;
    if (year.id) {
      if (selectedMediaType === "movie") p.primary_release_year = year.id;
      else p.first_air_date_year = year.id;
    }
    if (rating.id) p["vote_average.gte"] = rating.id;

    return p;
  }, [
    genre.id,
    provider.id,
    country.id,
    year.id,
    rating.id,
    page,
    selectedMediaType,
    formattedLanguage,
  ]);

  // Fetch data
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setIsLoading(true);
      try {
        const data = await get<TMDBDiscoverResult>(endpoint, params);
        if (cancelled) return;
        setTotalPages(data.total_pages || 1);
        const mapped: MediaItem[] = data.results.map((r: any) => ({
          id: String(r.id),
          title: selectedMediaType === "movie" ? r.title || "" : r.name || "",
          type: selectedMediaType === "movie" ? "movie" : "show",
          poster: r.poster_path
            ? `https://image.tmdb.org/t/p/w342/${r.poster_path}`
            : undefined,
          year:
            (selectedMediaType === "movie" ? r.release_date : r.first_air_date)
              ? Number(
                  (selectedMediaType === "movie"
                    ? r.release_date
                    : r.first_air_date
                  ).slice(0, 4),
                )
              : 0,
          release_date: (selectedMediaType === "movie"
            ? r.release_date
              ? new Date(r.release_date)
              : undefined
            : r.first_air_date
              ? new Date(r.first_air_date)
              : undefined) as any,
        }));
        setItems((prev) => (page === 1 ? mapped : [...prev, ...mapped]));
        setHasMore(page < (data.total_pages || 1));
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error(e);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endpoint, JSON.stringify(params)]);

  // Reset page when filters change (except page itself)
  useEffect(() => {
    setPage(1);
  }, [mediaType.id, genre.id, provider.id, country.id, year.id, rating.id]);

  // Infinite scroll sentinel
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!hasMore || isLoading) return;
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry.isIntersecting && hasMore && !isLoading) {
          setPage((p) => (p < totalPages ? p + 1 : p));
        }
      },
      { rootMargin: "600px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, isLoading, totalPages]);

  // Center and slim dropdowns; hide chevrons
  return (
    <WideContainer ultraWide>
      <div className="flex flex-wrap justify-center gap-2 items-center mb-6">
        <Dropdown
          hideChevron
          buttonClassName="py-2 pl-3 pr-6"
          selectedItem={mediaType}
          setSelectedItem={setMediaType}
          options={mediaTypeOptions}
        />
        <Dropdown
          hideChevron
          buttonClassName="py-2 pl-3 pr-6"
          selectedItem={year}
          setSelectedItem={setYear}
          options={yearOptions}
        />
        <Dropdown
          hideChevron
          buttonClassName="py-2 pl-3 pr-6"
          selectedItem={genre}
          setSelectedItem={setGenre}
          options={genreOptions}
        />
        <Dropdown
          hideChevron
          buttonClassName="py-2 pl-3 pr-6"
          selectedItem={rating}
          setSelectedItem={setRating}
          options={ratingOptions}
        />
        <Dropdown
          hideChevron
          buttonClassName="py-2 pl-3 pr-6"
          selectedItem={provider}
          setSelectedItem={setProvider}
          options={providerOptions}
        />
        <Dropdown
          hideChevron
          buttonClassName="py-2 pl-3 pr-6"
          selectedItem={country}
          setSelectedItem={setCountry}
          options={countryOptions}
        />
      </div>

      <MediaGrid>
        {isLoading && items.length === 0
          ? SKELETON_KEYS.map((k) => (
              <div
                key={k}
                className="relative mt-4 group rounded-xl p-2 bg-transparent w-[10rem] md:w-[11.5rem] h-auto"
              >
                <div className="animate-pulse">
                  <div className="w-full aspect-[2/3] bg-mediaCard-hoverBackground rounded-lg" />
                  <div className="mt-2 h-4 bg-mediaCard-hoverBackground rounded w-3/4" />
                </div>
              </div>
            ))
          : items.map((m) => (
              <MediaCard
                key={`${m.type}-${m.id}`}
                media={m}
                linkable
                onShowDetails={onShowDetails}
              />
            ))}
      </MediaGrid>

      <div ref={sentinelRef} className="h-10" />
    </WideContainer>
  );
}


