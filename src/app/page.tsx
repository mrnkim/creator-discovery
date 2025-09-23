"use client";

import { useState } from 'react';
import clsx from 'clsx';
import CreatorBrandMatch from './creator-brand-match/page';
import BrandMentionDetection from './brand-mention-detection/page';
import SemanticSearch from './semantic-search/page';

type TabType = 'creator-brand-match' | 'brand-mention-detection' | 'semantic-search';

export default function Home() {
  const [activeTab, setActiveTab] = useState<TabType>('creator-brand-match');

  const tabs = [
    {
      id: 'creator-brand-match' as TabType,
      label: 'Creator Brand Match',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
      ),
      description: 'Find the perfect creator-brand matches based on content analysis and audience alignment'
    },
    {
      id: 'brand-mention-detection' as TabType,
      label: 'Brand Mention Detection',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
        </svg>
      ),
      description: 'Analyze videos to detect brand mentions and track brand presence across creator content'
    },
    {
      id: 'semantic-search' as TabType,
      label: 'Semantic Search',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
      ),
      description: 'Search through video content using natural language and AI-powered semantic understanding'
    }
  ];

  const renderActiveTab = () => {
    switch (activeTab) {
      case 'creator-brand-match':
        return <CreatorBrandMatch />;
      case 'brand-mention-detection':
        return <BrandMentionDetection />;
      case 'semantic-search':
        return <SemanticSearch />;
      default:
        return <CreatorBrandMatch />;
    }
  };

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="bg-gray-800 text-white py-4 px-6">
        <h1 className="text-2xl font-bold">Creator Discovery</h1>
        <p className="text-sm opacity-80">Discover creators, analyze brand mentions, and find the perfect matches using AI-powered video analysis</p>
      </header>

      {/* Tab Navigation */}
      <div className="bg-white border-b border-gray-200">
        <div className="container mx-auto px-4">
          <nav className="flex space-x-8">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={clsx(
                  'flex items-center space-x-2 py-4 px-1 border-b-2 font-medium text-sm transition-colors',
                  activeTab === tab.id
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                )}
              >
                {tab.icon}
                <span>{tab.label}</span>
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* Tab Content */}
      <div className="flex-1">
        {renderActiveTab()}
      </div>
    </div>
  );
}