export interface ConversationMessage {
  role: 'assistant' | 'user';
  content: string;
  timestamp: number;
}

export interface ExtractedIssue {
  title: string;
  description: string;
  teamKey: string;
  templateName: string;
  priority: 1 | 2 | 3 | 4;
  labels: string[];
  dueDate?: string;
  isExistingIssue: boolean;
  existingIssueIdentifier?: string;
  confidence: number;
}

export interface TemplateMatch {
  templateName: string;
  templatePath: string;
  templateContent: string;
  confidence: number;
}
