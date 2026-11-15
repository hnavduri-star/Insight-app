/**
 * Seed taxonomy: 8 headings, 99 topics, 3 source books per topic.
 *
 * PROVISIONAL BOOK LIST: the brief points to the CATS constant in the prototype
 * file, which was not supplied. Topic names and headings follow section 10
 * exactly; the books below are a stand-in. Replace them with the prototype's
 * CATS mapping (same shape) and re-run `npm run db:seed` — the seed is idempotent.
 */
export type Book = [title: string, author: string];
export type Category = { name: string; icon: string; topics: Record<string, [Book, Book, Book]> };

export const CATS: Category[] = [
  {
    name: 'Thinking and Learning', icon: '🧠', topics: {
      'Critical Thinking': [['Thinking, Fast and Slow', 'Daniel Kahneman'], ['Asking the Right Questions', 'M. Neil Browne & Stuart Keeley'], ['The Scout Mindset', 'Julia Galef']],
      'Structured Problem Solving': [['Bulletproof Problem Solving', 'Charles Conn & Robert McLean'], ['The Pyramid Principle', 'Barbara Minto'], ['The McKinsey Way', 'Ethan Rasiel']],
      'Decision-Making': [['Decisive', 'Chip Heath & Dan Heath'], ['Thinking in Bets', 'Annie Duke'], ['Noise', 'Daniel Kahneman, Olivier Sibony & Cass Sunstein']],
      'Creative Thinking': [['Creative Confidence', 'Tom Kelley & David Kelley'], ['A Technique for Producing Ideas', 'James Webb Young'], ['Lateral Thinking', 'Edward de Bono']],
      'Systems Thinking': [['Thinking in Systems', 'Donella Meadows'], ['The Fifth Discipline', 'Peter Senge'], ['Upstream', 'Dan Heath']],
      'Data and Analytical Thinking': [['How to Measure Anything', 'Douglas Hubbard'], ['Naked Statistics', 'Charles Wheelan'], ['The Art of Statistics', 'David Spiegelhalter']],
      'Learning How to Learn': [['Make It Stick', 'Peter Brown, Henry Roediger & Mark McDaniel'], ['A Mind for Numbers', 'Barbara Oakley'], ['Ultralearning', 'Scott Young']],
      'Memory Techniques': [['Moonwalking with Einstein', 'Joshua Foer'], ['The Memory Book', 'Harry Lorayne & Jerry Lucas'], ['Unlimited Memory', 'Kevin Horsley']],
      'Reading Effectively': [['How to Read a Book', 'Mortimer Adler & Charles Van Doren'], ['Breakthrough Rapid Reading', 'Peter Kump'], ['The Shallows', 'Nicholas Carr']],
    },
  },
  {
    name: 'Communication and Public Speaking', icon: '🎤', topics: {
      'Clear Writing': [['On Writing Well', 'William Zinsser'], ['Smart Brevity', 'Jim VandeHei, Mike Allen & Roy Schwartz'], ['Writing for Busy Readers', 'Todd Rogers & Jessica Lasky-Fink']],
      'Storytelling': [['Made to Stick', 'Chip Heath & Dan Heath'], ['Storyworthy', 'Matthew Dicks'], ['The Storyteller\'s Secret', 'Carmine Gallo']],
      'Active Listening': [['You\'re Not Listening', 'Kate Murphy'], ['The Lost Art of Listening', 'Michael Nichols'], ['Just Listen', 'Mark Goulston']],
      'Asking Great Questions': [['Humble Inquiry', 'Edgar Schein'], ['A More Beautiful Question', 'Warren Berger'], ['Questions Are the Answer', 'Hal Gregersen']],
      'Nonverbal Communication': [['What Every Body Is Saying', 'Joe Navarro'], ['Presence', 'Amy Cuddy'], ['The Definitive Book of Body Language', 'Allan Pease & Barbara Pease']],
      'Virtual Communication': [['Digital Body Language', 'Erica Dhawan'], ['Remote Work Revolution', 'Tsedal Neeley'], ['Virtual Selling', 'Jeb Blount']],
      'Cross-Cultural Communication': [['The Culture Map', 'Erin Meyer'], ['Cultural Intelligence', 'David Livermore'], ['When Cultures Collide', 'Richard Lewis']],
      'Facilitation': [['The Art of Gathering', 'Priya Parker'], ['Gamestorming', 'Dave Gray, Sunni Brown & James Macanufo'], ['Facilitator\'s Guide to Participatory Decision-Making', 'Sam Kaner']],
      'Executive Presence': [['Executive Presence', 'Sylvia Ann Hewlett'], ['The Charisma Myth', 'Olivia Fox Cabane'], ['Compelling People', 'John Neffinger & Matthew Kohut']],
      'Public Speaking': [['TED Talks', 'Chris Anderson'], ['Talk Like TED', 'Carmine Gallo'], ['Resonate', 'Nancy Duarte']],
      'Handling Questions': [['In the Line of Fire', 'Jerry Weissman'], ['Presenting to Win', 'Jerry Weissman'], ['Speaking Up Without Freaking Out', 'Matt Abrahams']],
      'Overcoming Stage Fright': [['Confessions of a Public Speaker', 'Scott Berkun'], ['The Confidence Gap', 'Russ Harris'], ['The Anxiety Toolkit', 'Alice Boyes']],
      'Vocal Delivery': [['Freeing the Natural Voice', 'Kristin Linklater'], ['The Voice Book', 'Kate DeVore & Starr Cookman'], ['Set Your Voice Free', 'Roger Love']],
      'Impromptu Speaking': [['Think Faster, Talk Smarter', 'Matt Abrahams'], ['Impromptu', 'Judith Humphrey'], ['Improv Wisdom', 'Patricia Ryan Madson']],
      'Presenting to Executives': [['The Exceptional Presenter', 'Timothy Koegel'], ['Say It in Six', 'Ron Hoff'], ['Slide:ology', 'Nancy Duarte']],
      'Data Presentations': [['Storytelling with Data', 'Cole Nussbaumer Knaflic'], ['Say It with Charts', 'Gene Zelazny'], ['Good Charts', 'Scott Berinato']],
    },
  },
  {
    name: 'Influence, Negotiation and Sales', icon: '🤝', topics: {
      'Persuasion and Influence': [['Influence', 'Robert Cialdini'], ['Pre-Suasion', 'Robert Cialdini'], ['The Art of Persuasion', 'Bob Burg']],
      'Influencing Without Authority': [['Influence Without Authority', 'Allan Cohen & David Bradford'], ['Power', 'Jeffrey Pfeffer'], ['The Influential Mind', 'Tali Sharot']],
      'Pitching': [['Pitch Anything', 'Oren Klaff'], ['To Sell Is Human', 'Daniel Pink'], ['The Perfect Pitch', 'Jon Steel']],
      'Negotiation Fundamentals': [['Getting to Yes', 'Roger Fisher, William Ury & Bruce Patton'], ['Getting More', 'Stuart Diamond'], ['Bargaining for Advantage', 'G. Richard Shell']],
      'Negotiation Preparation': [['Negotiation Genius', 'Deepak Malhotra & Max Bazerman'], ['The Negotiation Book', 'Steve Gates'], ['Start with No', 'Jim Camp']],
      'Tactical Empathy': [['Never Split the Difference', 'Chris Voss'], ['Getting Past No', 'William Ury'], ['Talking to Strangers', 'Malcolm Gladwell']],
      'Interest-Based Negotiation': [['Beyond Reason', 'Roger Fisher & Daniel Shapiro'], ['Negotiating the Impossible', 'Deepak Malhotra'], ['The Power of a Positive No', 'William Ury']],
      'Salary Negotiation': [['Ask for It', 'Linda Babcock & Sara Laschever'], ['Women Don\'t Ask', 'Linda Babcock & Sara Laschever'], ['Fearless Salary Negotiation', 'Josh Doody']],
      'Consultative Selling': [['SPIN Selling', 'Neil Rackham'], ['The Challenger Sale', 'Matthew Dixon & Brent Adamson'], ['Gap Selling', 'Keenan']],
      'Handling Objections': [['Objections', 'Jeb Blount'], ['The Little Red Book of Selling', 'Jeffrey Gitomer'], ['Exactly What to Say', 'Phil M. Jones']],
      'Relationship Selling': [['The Trusted Advisor', 'David Maister, Charles Green & Robert Galford'], ['Never Eat Alone', 'Keith Ferrazzi'], ['Give and Take', 'Adam Grant']],
      'Client Management': [['Flawless Consulting', 'Peter Block'], ['Clients for Life', 'Jagdish Sheth & Andrew Sobel'], ['The Effortless Experience', 'Matthew Dixon, Nick Toman & Rick DeLisi']],
    },
  },
  {
    name: 'Difficult Conversations and Conflict', icon: '💬', topics: {
      'High-Stakes Talks': [['Crucial Conversations', 'Kerry Patterson, Joseph Grenny, Ron McMillan & Al Switzler'], ['Difficult Conversations', 'Douglas Stone, Bruce Patton & Sheila Heen'], ['Fierce Conversations', 'Susan Scott']],
      'Giving Feedback': [['Radical Candor', 'Kim Scott'], ['Thanks for the Feedback', 'Douglas Stone & Sheila Heen'], ['The Feedback Fix', 'Joe Hirsch']],
      'Delivering Bad News': [['Crucial Accountability', 'Kerry Patterson et al.'], ['How to Break Bad News', 'Robert Buckman'], ['Leadership on the Line', 'Ronald Heifetz & Marty Linsky']],
      'Setting Boundaries': [['Set Boundaries, Find Peace', 'Nedra Glover Tawwab'], ['Boundaries', 'Henry Cloud & John Townsend'], ['The Disease to Please', 'Harriet Braiker']],
      'Conflict Resolution': [['Nonviolent Communication', 'Marshall Rosenberg'], ['The Anatomy of Peace', 'The Arbinger Institute'], ['High Conflict', 'Amanda Ripley']],
      'Mediation': [['The Promise of Mediation', 'Robert Baruch Bush & Joseph Folger'], ['The Mediation Process', 'Christopher Moore'], ['Resolving Conflicts at Work', 'Kenneth Cloke & Joan Goldsmith']],
      'Team Conflict': [['The Five Dysfunctions of a Team', 'Patrick Lencioni'], ['Conflict Without Casualties', 'Nate Regier'], ['Leadership and Self-Deception', 'The Arbinger Institute']],
      'Repair and Apology': [['The Five Languages of Apology', 'Gary Chapman & Jennifer Thomas'], ['Why Won\'t You Apologize?', 'Harriet Lerner'], ['On Apology', 'Aaron Lazare']],
      'Managing Up': [['Managing Up', 'Mary Abbajay'], ['The First 90 Days', 'Michael Watkins'], ['HBR Guide to Managing Up and Across', 'Harvard Business Review']],
    },
  },
  {
    name: 'Leadership and Teams', icon: '🧭', topics: {
      'Leading Teams': [['Leaders Eat Last', 'Simon Sinek'], ['Extreme Ownership', 'Jocko Willink & Leif Babin'], ['The Making of a Manager', 'Julie Zhuo']],
      'Coaching People': [['The Coaching Habit', 'Michael Bungay Stanier'], ['Coaching for Performance', 'John Whitmore'], ['Helping People Change', 'Richard Boyatzis, Melvin Smith & Ellen Van Oosten']],
      'Psychological Safety': [['The Fearless Organization', 'Amy Edmondson'], ['The Four Stages of Psychological Safety', 'Timothy Clark'], ['Right Kind of Wrong', 'Amy Edmondson']],
      'Managing Change': [['Leading Change', 'John Kotter'], ['Switch', 'Chip Heath & Dan Heath'], ['Managing Transitions', 'William Bridges']],
      'High-Performing Teams': [['The Culture Code', 'Daniel Coyle'], ['Team of Teams', 'Stanley McChrystal'], ['Multipliers', 'Liz Wiseman']],
      'Building Trust': [['The Speed of Trust', 'Stephen M.R. Covey'], ['The Thin Book of Trust', 'Charles Feltman'], ['Trust and Inspire', 'Stephen M.R. Covey']],
      'Collaboration': [['Collaborative Intelligence', 'Dawna Markova & Angie McArthur'], ['Collaboration', 'Morten Hansen'], ['Teaming', 'Amy Edmondson']],
      'Inclusive Leadership': [['The Inclusion Dividend', 'Mark Kaplan & Mason Donovan'], ['How to Be an Inclusive Leader', 'Jennifer Brown'], ['Inclusify', 'Stefanie Johnson']],
    },
  },
  {
    name: 'Productivity and Project Management', icon: '⏱️', topics: {
      'Prioritization': [['Essentialism', 'Greg McKeown'], ['The ONE Thing', 'Gary Keller & Jay Papasan'], ['First Things First', 'Stephen Covey, A. Roger Merrill & Rebecca Merrill']],
      'Focus and Deep Work': [['Deep Work', 'Cal Newport'], ['Indistractable', 'Nir Eyal'], ['Hyperfocus', 'Chris Bailey']],
      'Habit Building': [['Atomic Habits', 'James Clear'], ['The Power of Habit', 'Charles Duhigg'], ['Tiny Habits', 'BJ Fogg']],
      'Planning and Systems': [['Getting Things Done', 'David Allen'], ['Building a Second Brain', 'Tiago Forte'], ['Make Time', 'Jake Knapp & John Zeratsky']],
      'Beating Procrastination': [['The Now Habit', 'Neil Fiore'], ['Solving the Procrastination Puzzle', 'Timothy Pychyl'], ['Eat That Frog!', 'Brian Tracy']],
      'Delegation and Meetings': [['The Surprising Science of Meetings', 'Steven Rogelberg'], ['Death by Meeting', 'Patrick Lencioni'], ['The One Minute Manager Meets the Monkey', 'Ken Blanchard']],
      'Project Planning': [['How Big Things Get Done', 'Bent Flyvbjerg & Dan Gardner'], ['Making Things Happen', 'Scott Berkun'], ['The Fast Forward MBA in Project Management', 'Eric Verzuh']],
      'Agile and Scrum': [['Scrum', 'Jeff Sutherland'], ['The Lean Startup', 'Eric Ries'], ['Shape Up', 'Ryan Singer']],
      'Risk Management': [['The Failure of Risk Management', 'Douglas Hubbard'], ['Antifragile', 'Nassim Nicholas Taleb'], ['Waltzing with Bears', 'Tom DeMarco & Timothy Lister']],
      'Stakeholder Management': [['Stakeholder Engagement', 'Lynda Bourne'], ['Influencer', 'Joseph Grenny et al.'], ['Engaging Stakeholders on Projects', 'Elizabeth Harrin']],
      'Scope and Estimation': [['Software Estimation', 'Steve McConnell'], ['Agile Estimating and Planning', 'Mike Cohn'], ['The Mythical Man-Month', 'Frederick Brooks']],
      'Lean Improvement': [['The Toyota Way', 'Jeffrey Liker'], ['Lean Thinking', 'James Womack & Daniel Jones'], ['The Goal', 'Eliyahu Goldratt']],
      'Project Recovery': [['Rescue the Problem Project', 'Todd Williams'], ['The Phoenix Project', 'Gene Kim, Kevin Behr & George Spafford'], ['Critical Chain', 'Eliyahu Goldratt']],
    },
  },
  {
    name: 'Business, Strategy and Finance', icon: '📈', topics: {
      'Business Strategy': [['Good Strategy Bad Strategy', 'Richard Rumelt'], ['Playing to Win', 'A.G. Lafley & Roger Martin'], ['Blue Ocean Strategy', 'W. Chan Kim & Renée Mauborgne']],
      'Competitive Analysis': [['Competitive Strategy', 'Michael Porter'], ['7 Powers', 'Hamilton Helmer'], ['Understanding Michael Porter', 'Joan Magretta']],
      'Innovation': [['The Innovator\'s Dilemma', 'Clayton Christensen'], ['Competing Against Luck', 'Clayton Christensen et al.'], ['Ten Types of Innovation', 'Larry Keeley']],
      'Customer Discovery': [['The Mom Test', 'Rob Fitzpatrick'], ['The Four Steps to the Epiphany', 'Steve Blank'], ['Continuous Discovery Habits', 'Teresa Torres']],
      'Business Model Design': [['Business Model Generation', 'Alexander Osterwalder & Yves Pigneur'], ['Value Proposition Design', 'Alexander Osterwalder et al.'], ['Running Lean', 'Ash Maurya']],
      'Product Thinking': [['Inspired', 'Marty Cagan'], ['The Lean Product Playbook', 'Dan Olsen'], ['Hooked', 'Nir Eyal']],
      'Scaling Organizations': [['Blitzscaling', 'Reid Hoffman & Chris Yeh'], ['Scaling Up', 'Verne Harnish'], ['High Output Management', 'Andrew Grove']],
      'Marketing Fundamentals': [['This Is Marketing', 'Seth Godin'], ['Positioning', 'Al Ries & Jack Trout'], ['Contagious', 'Jonah Berger']],
      'Branding': [['Building a StoryBrand', 'Donald Miller'], ['How Brands Grow', 'Byron Sharp'], ['Building Strong Brands', 'David Aaker']],
      'Reading Financial Statements': [['Financial Intelligence', 'Karen Berman & Joe Knight'], ['How to Read a Financial Report', 'John Tracy'], ['The Interpretation of Financial Statements', 'Benjamin Graham']],
      'Budgeting and Forecasting': [['Beyond Budgeting', 'Jeremy Hope & Robin Fraser'], ['Superforecasting', 'Philip Tetlock & Dan Gardner'], ['Financial Planning & Analysis and Performance Management', 'Jack Alexander']],
      'Unit Economics': [['The Startup Owner\'s Manual', 'Steve Blank & Bob Dorf'], ['Lean Analytics', 'Alistair Croll & Benjamin Yoskovitz'], ['Customer Centricity', 'Peter Fader']],
      'Valuation Basics': [['The Little Book of Valuation', 'Aswath Damodaran'], ['Valuation', 'McKinsey & Company'], ['Narrative and Numbers', 'Aswath Damodaran']],
      'Corporate Finance': [['Principles of Corporate Finance', 'Richard Brealey, Stewart Myers & Franklin Allen'], ['The Outsiders', 'William Thorndike'], ['Value', 'McKinsey & Company']],
      'Investing Fundamentals': [['The Intelligent Investor', 'Benjamin Graham'], ['A Random Walk Down Wall Street', 'Burton Malkiel'], ['The Little Book of Common Sense Investing', 'John Bogle']],
      'Pricing Strategy': [['Monetizing Innovation', 'Madhavan Ramanujam & Georg Tacke'], ['Confessions of the Pricing Man', 'Hermann Simon'], ['The Strategy and Tactics of Pricing', 'Thomas Nagle & Georg Müller']],
    },
  },
  {
    name: 'Wellbeing, Career and Growth', icon: '🌱', topics: {
      'Stress Relief': [['Why Zebras Don\'t Get Ulcers', 'Robert Sapolsky'], ['The Upside of Stress', 'Kelly McGonigal'], ['Burnout', 'Emily Nagoski & Amelia Nagoski']],
      'Self-Care and Recovery': [['Rest', 'Alex Soojung-Kim Pang'], ['Why We Sleep', 'Matthew Walker'], ['The Power of Full Engagement', 'Jim Loehr & Tony Schwartz']],
      'Preventing Burnout': [['The Burnout Epidemic', 'Jennifer Moss'], ['Dying for a Paycheck', 'Jeffrey Pfeffer'], ['Do Less', 'Kate Northrup']],
      'Mindfulness': [['Wherever You Go, There You Are', 'Jon Kabat-Zinn'], ['10% Happier', 'Dan Harris'], ['The Miracle of Mindfulness', 'Thich Nhat Hanh']],
      'Emotional Regulation': [['Emotional Intelligence 2.0', 'Travis Bradberry & Jean Greaves'], ['Permission to Feel', 'Marc Brackett'], ['Emotional Agility', 'Susan David']],
      'Self-Awareness': [['Insight', 'Tasha Eurich'], ['Emotional Intelligence', 'Daniel Goleman'], ['StrengthsFinder 2.0', 'Tom Rath']],
      'Resilience and Growth Mindset': [['Mindset', 'Carol Dweck'], ['Grit', 'Angela Duckworth'], ['Option B', 'Sheryl Sandberg & Adam Grant']],
      'Empathy and Relationships': [['How to Win Friends and Influence People', 'Dale Carnegie'], ['The Art of Empathy', 'Karla McLaren'], ['Dare to Lead', 'Brené Brown']],
      'Finding Your Purpose': [['Man\'s Search for Meaning', 'Viktor Frankl'], ['Start with Why', 'Simon Sinek'], ['Designing Your Life', 'Bill Burnett & Dave Evans']],
      'Curiosity and Interests': [['Curious', 'Ian Leslie'], ['The Power of Curiosity', 'Kathy Taberner & Kirsten Taberner Siggins'], ['Range', 'David Epstein']],
      'Creative Habits': [['The Creative Habit', 'Twyla Tharp'], ['The War of Art', 'Steven Pressfield'], ['Steal Like an Artist', 'Austin Kleon']],
      'Career Strategy': [['So Good They Can\'t Ignore You', 'Cal Newport'], ['The Start-up of You', 'Reid Hoffman & Ben Casnocha'], ['What Color Is Your Parachute?', 'Richard Bolles']],
      'Interviewing and Job Search': [['Cracking the PM Interview', 'Gayle Laakmann McDowell & Jackie Bavaro'], ['Knock \'em Dead', 'Martin Yate'], ['The 2-Hour Job Search', 'Steve Dalton']],
      'Personal Branding': [['Show Your Work!', 'Austin Kleon'], ['Reinventing You', 'Dorie Clark'], ['Stand Out', 'Dorie Clark']],
      'Networking': [['Networking for People Who Hate Networking', 'Devora Zack'], ['The 20-Minute Networking Meeting', 'Marcia Ballinger & Nathan Perez'], ['Superconnector', 'Scott Gerber & Ryan Paugh']],
      'Personal Finance': [['The Psychology of Money', 'Morgan Housel'], ['I Will Teach You to Be Rich', 'Ramit Sethi'], ['Your Money or Your Life', 'Vicki Robin & Joe Dominguez']],
    },
  },
];

export const BADGES = [
  { key: 'first_lesson', name: 'First lesson', description: 'Finish your first lesson' },
  { key: 'streak_3', name: '3-day streak', description: 'Learn three days in a row' },
  { key: 'perfect_quiz', name: 'Perfect quiz', description: 'Answer 3 of 3 quiz questions correctly' },
  { key: 'level_2', name: 'Level 2', description: 'Reach Apprentice' },
  { key: 'polymath', name: 'Polymath', description: 'Earn XP in 3 or more topics' },
  { key: 'scenario_ace', name: 'Scenario ace', description: 'Score 80 or higher on a scenario' },
];
