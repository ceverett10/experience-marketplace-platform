import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QuestionsForm, type GuestData } from './QuestionsForm';

// Mock TermsModal to avoid rendering complexity
vi.mock('@/components/checkout/TermsModal', () => ({
  TermsModal: () => null,
}));

const defaultAvailability = {
  id: 'avail-1',
  date: '2026-03-15',
  product: { name: 'Test Experience' },
  questionList: {
    nodes: [] as {
      id: string;
      label: string;
      type: string;
      dataType: string;
      answerValue: string | undefined;
      isRequired: boolean;
      availableOptions?: { label: string; value: string }[];
    }[],
  },
  personList: {
    nodes: [
      {
        id: 'person-1',
        pricingCategoryLabel: 'Adult',
        isQuestionsComplete: false,
        questionList: {
          nodes: [
            {
              id: 'pq-fn',
              label: 'First name',
              type: 'TEXT',
              dataType: 'STRING',
              answerValue: undefined as string | undefined,
              isRequired: true,
            },
            {
              id: 'pq-ln',
              label: 'Last name',
              type: 'TEXT',
              dataType: 'STRING',
              answerValue: undefined as string | undefined,
              isRequired: true,
            },
          ],
        },
      },
    ],
  },
};

const defaultProps = {
  bookingId: 'test-booking-1',
  bookingQuestions: [] as {
    id: string;
    label: string;
    type: string;
    dataType: string;
    answerValue: string | undefined;
    isRequired: boolean;
  }[],
  availabilities: [defaultAvailability],
  onSubmit: vi.fn(),
  isSubmitting: false,
};

describe('QuestionsForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders lead person fields', () => {
    render(<QuestionsForm {...defaultProps} />);

    expect(screen.getByPlaceholderText('First name *')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Last name *')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Email Address *')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Phone Number *')).toBeInTheDocument();
  });

  it('validates required lead person fields on submit', async () => {
    const onSubmit = vi.fn();
    render(<QuestionsForm {...defaultProps} onSubmit={onSubmit} />);

    fireEvent.click(screen.getByTestId('submit-questions'));

    expect(screen.getByText('First name is required')).toBeInTheDocument();
    expect(screen.getByText('Last name is required')).toBeInTheDocument();
    expect(screen.getByText('Email is required')).toBeInTheDocument();
    expect(screen.getByText('Phone number is required')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('validates email format', async () => {
    render(<QuestionsForm {...defaultProps} />);

    fireEvent.change(screen.getByPlaceholderText('First name *'), { target: { value: 'John' } });
    fireEvent.change(screen.getByPlaceholderText('Last name *'), { target: { value: 'Smith' } });
    fireEvent.change(screen.getByPlaceholderText('Email Address *'), {
      target: { value: 'bad-email' },
    });
    fireEvent.change(screen.getByPlaceholderText('Phone Number *'), { target: { value: '123' } });

    // Check the terms checkbox using change event
    const termsCheckbox = screen.getByTestId('terms-checkbox');
    fireEvent.change(termsCheckbox, { target: { checked: true } });

    fireEvent.submit(screen.getByTestId('questions-form'));

    await waitFor(() => {
      expect(screen.getByText('Invalid email address')).toBeInTheDocument();
    });
  });

  it('submits correct data on valid form', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<QuestionsForm {...defaultProps} onSubmit={onSubmit} />);

    fireEvent.change(screen.getByPlaceholderText('First name *'), { target: { value: 'John' } });
    fireEvent.change(screen.getByPlaceholderText('Last name *'), { target: { value: 'Smith' } });
    fireEvent.change(screen.getByPlaceholderText('Email Address *'), {
      target: { value: 'john@test.com' },
    });
    fireEvent.change(screen.getByPlaceholderText('Phone Number *'), {
      target: { value: '7700900123' },
    });
    fireEvent.click(screen.getByTestId('terms-checkbox'));

    fireEvent.click(screen.getByTestId('submit-questions'));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          customerEmail: 'john@test.com',
          customerPhone: '+44 7700900123',
          termsAccepted: true,
          guests: expect.arrayContaining([
            expect.objectContaining({
              firstName: 'John',
              lastName: 'Smith',
              isLeadGuest: true,
            }),
          ]),
        })
      );
    });
  });

  it('shows "Proceed to Payment" when isResubmission=false', () => {
    render(<QuestionsForm {...defaultProps} isResubmission={false} />);
    expect(screen.getByTestId('submit-questions')).toHaveTextContent('Proceed to Payment');
  });

  it('shows "Submit Answers" when isResubmission=true', () => {
    render(<QuestionsForm {...defaultProps} isResubmission={true} />);
    expect(screen.getByTestId('submit-questions')).toHaveTextContent('Submit Answers');
  });

  it('shows "Processing..." when isSubmitting=true', () => {
    render(<QuestionsForm {...defaultProps} isSubmitting={true} />);
    expect(screen.getByTestId('submit-questions')).toHaveTextContent('Processing...');
  });

  it('renders "Your Details" heading instead of "Lead Person Details"', () => {
    render(<QuestionsForm {...defaultProps} />);
    expect(screen.getByText('Your Details')).toBeInTheDocument();
    expect(screen.queryByText('Lead Person Details')).not.toBeInTheDocument();
  });

  it('does not render Holibob bank statement warning box', () => {
    render(<QuestionsForm {...defaultProps} />);
    expect(screen.queryByText(/HOLIBOB LTD UK/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Payment statement notice/)).not.toBeInTheDocument();
  });

  it('renders simplified terms checkbox without bank statement text', () => {
    render(<QuestionsForm {...defaultProps} />);
    const termsLabel = screen.getByTestId('terms-checkbox').closest('label');
    expect(termsLabel).toBeInTheDocument();
    expect(termsLabel?.textContent).toContain('Terms and Conditions');
    expect(termsLabel?.textContent).not.toContain('HOLIBOB');
    expect(termsLabel?.textContent).not.toContain('bank statement');
  });

  it('does not render "Completion" section heading', () => {
    render(<QuestionsForm {...defaultProps} />);
    expect(screen.queryByText('Completion')).not.toBeInTheDocument();
  });

  it('renders "Payment processed by Holibob Ltd" footnote', () => {
    render(<QuestionsForm {...defaultProps} totalPrice="£35.00" />);
    expect(screen.getByText('Payment processed by Holibob Ltd')).toBeInTheDocument();
  });
});

describe('QuestionsForm - Dynamic Questions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders SELECT question as dropdown', () => {
    const props = {
      ...defaultProps,
      availabilities: [
        {
          ...defaultAvailability,
          questionList: {
            nodes: [
              {
                id: 'aq-pickup',
                label: 'Pickup Location',
                type: 'SELECT',
                dataType: 'STRING',
                answerValue: undefined,
                isRequired: true,
                availableOptions: [
                  { label: 'Hotel Lobby', value: 'hotel' },
                  { label: 'Airport', value: 'airport' },
                ],
              },
            ],
          },
        },
      ],
    };

    render(<QuestionsForm {...props} />);

    const dynamicField = screen.getByTestId('dynamic-question-aq-pickup');
    expect(dynamicField).toBeInTheDocument();

    // Should have a select element
    const select = dynamicField.querySelector('select');
    expect(select).toBeInTheDocument();

    // Should have options
    expect(screen.getByText('Hotel Lobby')).toBeInTheDocument();
    expect(screen.getByText('Airport')).toBeInTheDocument();
  });

  it('renders BOOLEAN question as checkbox', () => {
    const props = {
      ...defaultProps,
      availabilities: [
        {
          ...defaultAvailability,
          questionList: {
            nodes: [
              {
                id: 'aq-waiver',
                label: 'I accept the risk waiver',
                type: 'BOOLEAN',
                dataType: 'BOOLEAN',
                answerValue: undefined,
                isRequired: true,
              },
            ],
          },
        },
      ],
    };

    render(<QuestionsForm {...props} />);

    const dynamicField = screen.getByTestId('dynamic-question-aq-waiver');
    expect(dynamicField).toBeInTheDocument();

    const checkbox = dynamicField.querySelector('input[type="checkbox"]');
    expect(checkbox).toBeInTheDocument();
  });

  it('renders TEXTAREA question', () => {
    const props = {
      ...defaultProps,
      availabilities: [
        {
          ...defaultAvailability,
          questionList: {
            nodes: [
              {
                id: 'aq-dietary',
                label: 'Dietary Requirements',
                type: 'TEXTAREA',
                dataType: 'STRING',
                answerValue: undefined,
                isRequired: false,
              },
            ],
          },
        },
      ],
    };

    render(<QuestionsForm {...props} />);

    const dynamicField = screen.getByTestId('dynamic-question-aq-dietary');
    expect(dynamicField).toBeInTheDocument();

    const textarea = dynamicField.querySelector('textarea');
    expect(textarea).toBeInTheDocument();
  });

  it('renders DATE question', () => {
    const props = {
      ...defaultProps,
      availabilities: [
        {
          ...defaultAvailability,
          questionList: {
            nodes: [
              {
                id: 'aq-dob',
                label: 'Date of Birth',
                type: 'DATE',
                dataType: 'DATE',
                answerValue: undefined,
                isRequired: true,
              },
            ],
          },
        },
      ],
    };

    render(<QuestionsForm {...props} />);

    const dynamicField = screen.getByTestId('dynamic-question-aq-dob');
    const dateInput = dynamicField.querySelector('input[type="date"]');
    expect(dateInput).toBeInTheDocument();
  });

  it('renders NUMBER question', () => {
    const props = {
      ...defaultProps,
      availabilities: [
        {
          ...defaultAvailability,
          questionList: {
            nodes: [
              {
                id: 'aq-age',
                label: 'Age',
                type: 'NUMBER',
                dataType: 'NUMBER',
                answerValue: undefined,
                isRequired: true,
              },
            ],
          },
        },
      ],
    };

    render(<QuestionsForm {...props} />);

    const dynamicField = screen.getByTestId('dynamic-question-aq-age');
    const numberInput = dynamicField.querySelector('input[type="number"]');
    expect(numberInput).toBeInTheDocument();
  });

  it('does not render auto-fillable questions (name/email/phone) as dynamic fields', () => {
    // Person questions with name/email/phone labels should be filtered out
    // because the lead person form handles them
    const props = {
      ...defaultProps,
      availabilities: [
        {
          ...defaultAvailability,
          questionList: {
            nodes: [
              {
                id: 'aq-email',
                label: 'Email address',
                type: 'EMAIL',
                dataType: 'STRING',
                answerValue: undefined,
                isRequired: true,
              },
              {
                id: 'aq-pickup',
                label: 'Pickup Location',
                type: 'TEXT',
                dataType: 'STRING',
                answerValue: undefined,
                isRequired: true,
              },
            ],
          },
        },
      ],
    };

    render(<QuestionsForm {...props} />);

    // Email should be auto-fillable, so no dynamic field rendered for it
    expect(screen.queryByTestId('dynamic-question-aq-email')).not.toBeInTheDocument();
    // Pickup Location is NOT auto-fillable, so should be rendered
    expect(screen.getByTestId('dynamic-question-aq-pickup')).toBeInTheDocument();
  });

  it('does not render questions that already have answerValue', () => {
    const props = {
      ...defaultProps,
      availabilities: [
        {
          ...defaultAvailability,
          questionList: {
            nodes: [
              {
                id: 'aq-answered',
                label: 'Pickup Location',
                type: 'TEXT',
                dataType: 'STRING',
                answerValue: 'Hotel',
                isRequired: true,
              },
              {
                id: 'aq-unanswered',
                label: 'Dietary Requirements',
                type: 'TEXT',
                dataType: 'STRING',
                answerValue: undefined,
                isRequired: false,
              },
            ],
          },
        },
      ],
    };

    render(<QuestionsForm {...props} />);

    expect(screen.queryByTestId('dynamic-question-aq-answered')).not.toBeInTheDocument();
    expect(screen.getByTestId('dynamic-question-aq-unanswered')).toBeInTheDocument();
  });

  it('includes dynamic answers in questionAnswers on submit', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const props = {
      ...defaultProps,
      onSubmit,
      availabilities: [
        {
          ...defaultAvailability,
          questionList: {
            nodes: [
              {
                id: 'aq-pickup',
                label: 'Pickup Location',
                type: 'SELECT',
                dataType: 'STRING',
                answerValue: undefined,
                isRequired: true,
                availableOptions: [
                  { label: 'Hotel', value: 'hotel' },
                  { label: 'Airport', value: 'airport' },
                ],
              },
            ],
          },
        },
      ],
    };

    render(<QuestionsForm {...props} />);

    // Fill lead person
    fireEvent.change(screen.getByPlaceholderText('First name *'), { target: { value: 'John' } });
    fireEvent.change(screen.getByPlaceholderText('Last name *'), { target: { value: 'Smith' } });
    fireEvent.change(screen.getByPlaceholderText('Email Address *'), {
      target: { value: 'john@test.com' },
    });
    fireEvent.change(screen.getByPlaceholderText('Phone Number *'), { target: { value: '123' } });
    fireEvent.click(screen.getByTestId('terms-checkbox'));

    // Select dynamic answer
    const select = screen.getByTestId('dynamic-question-aq-pickup').querySelector('select')!;
    fireEvent.change(select, { target: { value: 'hotel' } });

    fireEvent.click(screen.getByTestId('submit-questions'));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          questionAnswers: expect.arrayContaining([{ questionId: 'aq-pickup', value: 'hotel' }]),
        })
      );
    });
  });

  it('validates required dynamic questions on submit', () => {
    const onSubmit = vi.fn();
    const props = {
      ...defaultProps,
      onSubmit,
      availabilities: [
        {
          ...defaultAvailability,
          questionList: {
            nodes: [
              {
                id: 'aq-pickup',
                label: 'Pickup Location',
                type: 'SELECT',
                dataType: 'STRING',
                answerValue: undefined,
                isRequired: true,
                availableOptions: [{ label: 'Hotel', value: 'hotel' }],
              },
            ],
          },
        },
      ],
    };

    render(<QuestionsForm {...props} />);

    // Fill lead person but NOT the dynamic question
    fireEvent.change(screen.getByPlaceholderText('First name *'), { target: { value: 'John' } });
    fireEvent.change(screen.getByPlaceholderText('Last name *'), { target: { value: 'Smith' } });
    fireEvent.change(screen.getByPlaceholderText('Email Address *'), {
      target: { value: 'john@test.com' },
    });
    fireEvent.change(screen.getByPlaceholderText('Phone Number *'), { target: { value: '123' } });
    fireEvent.click(screen.getByTestId('terms-checkbox'));

    fireEvent.click(screen.getByTestId('submit-questions'));

    expect(screen.getByText('Pickup Location is required')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

describe('QuestionsForm - Per-Person Questions', () => {
  it('hides person section when isQuestionsComplete=true', () => {
    const props = {
      ...defaultProps,
      availabilities: [
        {
          ...defaultAvailability,
          personList: {
            nodes: [
              {
                id: 'person-complete',
                pricingCategoryLabel: 'Adult',
                isQuestionsComplete: true,
                questionList: {
                  nodes: [
                    {
                      id: 'pq-complete',
                      label: 'Age',
                      type: 'NUMBER',
                      dataType: 'NUMBER',
                      answerValue: undefined,
                      isRequired: true,
                    },
                  ],
                },
              },
              {
                id: 'person-incomplete',
                pricingCategoryLabel: 'Child',
                isQuestionsComplete: false,
                questionList: {
                  nodes: [
                    {
                      id: 'pq-incomplete',
                      label: 'Age',
                      type: 'NUMBER',
                      dataType: 'NUMBER',
                      answerValue: undefined,
                      isRequired: true,
                    },
                  ],
                },
              },
            ],
          },
        },
      ],
    };

    render(<QuestionsForm {...props} />);

    // Complete person should NOT be shown
    expect(screen.queryByTestId('person-section-person-complete')).not.toBeInTheDocument();
    // Incomplete person SHOULD be shown
    expect(screen.getByTestId('person-section-person-incomplete')).toBeInTheDocument();
  });

  it('shows "Guest Details" heading when there are per-person questions', () => {
    const props = {
      ...defaultProps,
      availabilities: [
        {
          ...defaultAvailability,
          personList: {
            nodes: [
              {
                id: 'person-1',
                pricingCategoryLabel: 'Child',
                isQuestionsComplete: false,
                questionList: {
                  nodes: [
                    {
                      id: 'pq-age',
                      label: 'Age',
                      type: 'NUMBER',
                      dataType: 'NUMBER',
                      answerValue: undefined,
                      isRequired: true,
                    },
                  ],
                },
              },
            ],
          },
        },
      ],
    };

    render(<QuestionsForm {...props} />);

    expect(screen.getByText('Guest Details')).toBeInTheDocument();
  });
});
