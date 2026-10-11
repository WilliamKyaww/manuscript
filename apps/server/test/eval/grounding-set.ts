/**
 * The personal evaluation set for grounded answers (Phase 21, task 21.05): eight pieces of lecture
 * material over two modules, each fact on a known slide or page, and fifty questions — forty-two that
 * the material answers, each naming the slide or page that holds the answer and words the answer
 * must contain, and eight a student might ask that it does not answer. Questions are worded unlike
 * the slides where possible, so that finding the passage is not just matching words.
 */

export interface EvalDocument {
  file: string;
  /** Slides (PPTX) or pages (PDF), in order; each a title and its lines. */
  parts: { title: string; lines: string[] }[];
}

export interface EvalQuestion {
  question: string;
  /** Where the answer is: the file and its 1-based slide or page; absent when the material has none. */
  source?: { file: string; part: number };
  /** Words a correct answer contains (any order, any case). */
  keywords?: string[];
}

export const DOCUMENTS: readonly EvalDocument[] = [
  {
    file: 'COC251 L1 Time and clocks.pptx',
    parts: [
      {
        title: 'Physical clocks',
        lines: [
          'Quartz clocks drift by about one microsecond every second.',
          'NTP synchronises clocks over the network.',
        ],
      },
      {
        title: 'Lamport clocks',
        lines: [
          'A Lamport clock is a counter incremented on every event.',
          'A message carries the sender counter; the receiver takes the maximum plus one.',
        ],
      },
      {
        title: 'Happens-before',
        lines: [
          'Event a happens before b if both are in one process in that order,',
          'or a is the sending of a message and b its receipt, or by transitivity.',
        ],
      },
      {
        title: 'Vector clocks',
        lines: [
          'A vector clock keeps one counter per process.',
          'Two events are concurrent when neither vector is less than or equal to the other.',
        ],
      },
    ],
  },
  {
    file: 'COC251 L2 Consensus and Paxos.pptx',
    parts: [
      {
        title: 'The consensus problem',
        lines: [
          'Consensus requires agreement, validity and termination.',
          'FLP: no deterministic protocol guarantees termination in an asynchronous system with one faulty process.',
        ],
      },
      {
        title: 'Paxos roles',
        lines: [
          'Paxos has proposers, acceptors and learners.',
          'A value is chosen when a majority of acceptors accept the same proposal.',
        ],
      },
      {
        title: 'Phase one: prepare',
        lines: [
          'A proposer sends prepare(n).',
          'An acceptor promises to ignore proposals numbered below n and returns any value it has accepted.',
        ],
      },
      {
        title: 'Phase two: accept',
        lines: [
          'The proposer sends accept(n, v),',
          'where v is the value of the highest-numbered proposal reported, or its own value if none was.',
        ],
      },
    ],
  },
  {
    file: 'COC251 L3 Raft.pptx',
    parts: [
      {
        title: 'Raft',
        lines: ['Raft decomposes consensus into leader election, log replication and safety.'],
      },
      {
        title: 'Leader election',
        lines: [
          'A follower that hears no heartbeat within an election timeout of 150 to 300 milliseconds',
          'becomes a candidate and requests votes.',
        ],
      },
      {
        title: 'Terms',
        lines: [
          'Each term begins with an election.',
          'A server that sees a higher term reverts to follower.',
        ],
      },
      {
        title: 'Log replication',
        lines: [
          'The leader appends entries and sends AppendEntries.',
          'An entry is committed once it is stored on a majority of servers.',
        ],
      },
      {
        title: 'Safety',
        lines: [
          'The election restriction: a voter grants its vote only if the candidate log',
          'is at least as up to date as its own.',
        ],
      },
    ],
  },
  {
    file: 'COC251 Reading Commit and CAP.pdf',
    parts: [
      {
        title: 'Two-phase commit',
        lines: [
          'The coordinator sends PREPARE, collects the votes,',
          'and sends COMMIT only if every participant voted yes.',
        ],
      },
      {
        title: 'Blocking',
        lines: [
          'Two-phase commit blocks when the coordinator fails after the participants voted yes',
          'but before they learn the outcome.',
        ],
      },
      {
        title: 'The CAP theorem',
        lines: [
          'During a network partition a system must choose between consistency and availability.',
        ],
      },
      {
        title: 'Linearizability',
        lines: [
          'Every operation appears to take effect atomically',
          'at some instant between its invocation and its response.',
        ],
      },
    ],
  },
  {
    file: 'COC262 L1 Gradient descent.pptx',
    parts: [
      {
        title: 'Gradient descent',
        lines: [
          'Update the parameters by subtracting the learning rate times the gradient of the loss.',
        ],
      },
      {
        title: 'Stochastic gradient descent',
        lines: ['Estimate the gradient from a mini-batch:', 'noisier, but each step is cheap.'],
      },
      {
        title: 'Momentum',
        lines: [
          'Keep an exponentially decaying average of past gradients,',
          'which damps oscillation across a ravine.',
        ],
      },
      {
        title: 'Adam',
        lines: [
          'Momentum combined with per-parameter learning rates,',
          'scaled by a running average of squared gradients.',
        ],
      },
    ],
  },
  {
    file: 'COC262 L2 Regularisation.pptx',
    parts: [
      {
        title: 'Overfitting',
        lines: ['Training error keeps falling while validation error rises.'],
      },
      {
        title: 'L2 regularisation',
        lines: [
          'Add the sum of squared weights to the loss,',
          'shrinking the weights towards zero.',
        ],
      },
      {
        title: 'Dropout',
        lines: [
          'Randomly zero activations during training with probability p,',
          'typically 0.5 for hidden layers.',
        ],
      },
      {
        title: 'Early stopping',
        lines: [
          'Halt training when the validation loss has not improved',
          'for a set number of epochs, called the patience.',
        ],
      },
    ],
  },
  {
    file: 'COC262 Reading Attention.pdf',
    parts: [
      {
        title: 'Scaled dot-product attention',
        lines: [
          'Attention computes softmax of Q times K transposed over the square root of d_k, times V.',
        ],
      },
      {
        title: 'Why scale',
        lines: [
          'Dividing by the square root of d_k stops the dot products growing with the dimension',
          'and saturating the softmax.',
        ],
      },
      {
        title: 'Multi-head attention',
        lines: [
          'Several attention functions run in parallel on learned projections,',
          'and their results are concatenated.',
        ],
      },
      {
        title: 'Positional encoding',
        lines: [
          'Transformers add positional encodings to the input embeddings',
          'because attention itself ignores the order of the tokens.',
        ],
      },
    ],
  },
  {
    file: 'COC262 L3 Convolutional networks.pptx',
    parts: [
      {
        title: 'Convolution',
        lines: [
          'A convolutional layer slides learned filters over the input,',
          'sharing the weights across positions.',
        ],
      },
      {
        title: 'Pooling',
        lines: [
          'Max pooling keeps the largest value in each window,',
          'giving some invariance to small translations.',
        ],
      },
      {
        title: 'Receptive field',
        lines: [
          'The receptive field grows with depth:',
          'two stacked 3 by 3 convolutions see a 5 by 5 region.',
        ],
      },
      {
        title: 'Batch normalisation',
        lines: [
          'Normalise each channel over the mini-batch,',
          'then scale and shift it with learned parameters.',
        ],
      },
    ],
  },
];

const L1 = 'COC251 L1 Time and clocks.pptx';
const L2 = 'COC251 L2 Consensus and Paxos.pptx';
const L3 = 'COC251 L3 Raft.pptx';
const R1 = 'COC251 Reading Commit and CAP.pdf';
const M1 = 'COC262 L1 Gradient descent.pptx';
const M2 = 'COC262 L2 Regularisation.pptx';
const R2 = 'COC262 Reading Attention.pdf';
const M3 = 'COC262 L3 Convolutional networks.pptx';

export const QUESTIONS: readonly EvalQuestion[] = [
  {
    question: 'How much do quartz clocks drift?',
    source: { file: L1, part: 1 },
    keywords: ['microsecond'],
  },
  {
    question: 'Which protocol keeps computer clocks in step over a network?',
    source: { file: L1, part: 1 },
    keywords: ['NTP'],
  },
  {
    question: 'What does a process do to its Lamport clock when a message arrives?',
    source: { file: L1, part: 2 },
    keywords: ['maximum'],
  },
  {
    question: 'When is a Lamport counter incremented?',
    source: { file: L1, part: 2 },
    keywords: ['event'],
  },
  {
    question: 'Give the three ways one event can happen before another.',
    source: { file: L1, part: 3 },
    keywords: ['transitivity'],
  },
  {
    question: 'How many counters does a vector clock hold?',
    source: { file: L1, part: 4 },
    keywords: ['process'],
  },
  {
    question: 'How can you tell from vector timestamps that two events were concurrent?',
    source: { file: L1, part: 4 },
    keywords: ['neither'],
  },
  {
    question: 'Which three properties must a consensus protocol provide?',
    source: { file: L2, part: 1 },
    keywords: ['agreement', 'validity', 'termination'],
  },
  {
    question: 'What does the FLP result say about asynchronous systems?',
    source: { file: L2, part: 1 },
    keywords: ['termination'],
  },
  {
    question: 'Name the roles in Paxos.',
    source: { file: L2, part: 2 },
    keywords: ['proposer', 'acceptor', 'learner'],
  },
  {
    question: 'When is a value chosen in Paxos?',
    source: { file: L2, part: 2 },
    keywords: ['majority'],
  },
  {
    question: 'What does a Paxos acceptor promise when it answers a prepare request?',
    source: { file: L2, part: 3 },
    keywords: ['below'],
  },
  {
    question: 'In the accept phase, which value must the proposer put forward?',
    source: { file: L2, part: 4 },
    keywords: ['highest'],
  },
  {
    question: 'Into which sub-problems does Raft split consensus?',
    source: { file: L3, part: 1 },
    keywords: ['election', 'replication', 'safety'],
  },
  {
    question: 'How long is a Raft election timeout?',
    source: { file: L3, part: 2 },
    keywords: ['150', '300'],
  },
  {
    question: 'What makes a Raft follower start an election?',
    source: { file: L3, part: 2 },
    keywords: ['heartbeat'],
  },
  {
    question: 'What does a Raft server do when it sees a higher term?',
    source: { file: L3, part: 3 },
    keywords: ['follower'],
  },
  {
    question: 'When is a log entry committed in Raft?',
    source: { file: L3, part: 4 },
    keywords: ['majority'],
  },
  {
    question: 'Which RPC does the Raft leader use to replicate entries?',
    source: { file: L3, part: 4 },
    keywords: ['AppendEntries'],
  },
  {
    question: 'What is the election restriction in Raft?',
    source: { file: L3, part: 5 },
    keywords: ['up to date'],
  },
  {
    question: 'When does the coordinator in two-phase commit send COMMIT?',
    source: { file: R1, part: 1 },
    keywords: ['every'],
  },
  {
    question: 'Why can two-phase commit block?',
    source: { file: R1, part: 2 },
    keywords: ['coordinator', 'fail'],
  },
  {
    question: 'What trade-off does the CAP theorem describe?',
    source: { file: R1, part: 3 },
    keywords: ['consistency', 'availability'],
  },
  {
    question: 'When must a distributed store give up consistency or availability?',
    source: { file: R1, part: 3 },
    keywords: ['partition'],
  },
  { question: 'Define linearizability.', source: { file: R1, part: 4 }, keywords: ['instant'] },
  {
    question: 'How does gradient descent change the parameters?',
    source: { file: M1, part: 1 },
    keywords: ['learning rate', 'gradient'],
  },
  {
    question: 'Why use mini-batches instead of the whole data set for each update?',
    source: { file: M1, part: 2 },
    keywords: ['cheap'],
  },
  {
    question: 'What does momentum do to oscillation in a ravine?',
    source: { file: M1, part: 3 },
    keywords: ['damp'],
  },
  {
    question: 'How does Adam scale each learning rate?',
    source: { file: M1, part: 4 },
    keywords: ['squared'],
  },
  {
    question: 'What sign in the training curves shows overfitting?',
    source: { file: M2, part: 1 },
    keywords: ['validation'],
  },
  {
    question: 'What does L2 regularisation add to the loss?',
    source: { file: M2, part: 2 },
    keywords: ['squared weights'],
  },
  {
    question: 'What dropout probability is typical for hidden layers?',
    source: { file: M2, part: 3 },
    keywords: ['0.5'],
  },
  {
    question: 'What is the patience in early stopping?',
    source: { file: M2, part: 4 },
    keywords: ['epochs'],
  },
  {
    question: 'Write the formula for scaled dot-product attention.',
    source: { file: R2, part: 1 },
    keywords: ['softmax'],
  },
  {
    question: 'Why are the attention scores divided by the square root of d_k?',
    source: { file: R2, part: 2 },
    keywords: ['saturat'],
  },
  {
    question: 'What does multi-head attention do with the results of its heads?',
    source: { file: R2, part: 3 },
    keywords: ['concatenat'],
  },
  {
    question: 'Why do transformers need positional encodings?',
    source: { file: R2, part: 4 },
    keywords: ['order'],
  },
  {
    question: 'What does weight sharing mean in a convolutional layer?',
    source: { file: M3, part: 1 },
    keywords: ['positions'],
  },
  {
    question: 'What does max pooling keep from each window?',
    source: { file: M3, part: 2 },
    keywords: ['largest'],
  },
  {
    question: 'What region do two stacked 3 by 3 convolutions see?',
    source: { file: M3, part: 3 },
    keywords: ['5 by 5'],
  },
  {
    question: 'What does batch normalisation do after normalising a channel?',
    source: { file: M3, part: 4 },
    keywords: ['scale', 'shift'],
  },
  {
    question: 'Over what does batch normalisation compute its statistics?',
    source: { file: M3, part: 4 },
    keywords: ['mini-batch'],
  },
  // Not in the material: a grounded answer says so rather than answering from general knowledge.
  { question: 'What does the Byzantine generals problem assume about traitors?' },
  { question: 'How does a gossip protocol spread updates?' },
  { question: 'Who designed the Raft algorithm, and in which year?' },
  { question: 'What is a Bloom filter used for?' },
  { question: 'How does k-means choose its first centroids?' },
  { question: 'What causes vanishing gradients in recurrent networks?' },
  { question: 'What is the default learning rate of Adam?' },
  { question: 'How does ZooKeeper order its writes?' },
];
