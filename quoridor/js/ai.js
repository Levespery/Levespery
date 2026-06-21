// AI 人机对战系统
const AI = {
  difficulty: 'hard',

  setDifficulty(level) {
    this.difficulty = level;
    SmartAI.setDifficulty(level);
    console.log('AI 难度设置为:', level);
  },

  async makeMove() {
    await SmartAI.makeMove();
  }
};
