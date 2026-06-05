---
title: 机器学习
icon: pen-to-square
date: 2026-05-29
category:
  - 技术领域
tag:
  - machine-learning
  - ai
  - algorithms
  - data-science
---

# 机器学习

机器学习（Machine Learning）是人工智能的核心子领域，旨在让计算机从数据中自动学习规律，而非依赖显式编程。它是现代 AI 应用的基石，覆盖了从推荐系统到自动驾驶的广泛场景。

## 三大学习范式

- **监督学习（Supervised Learning）**：从标注数据中学习输入到输出的映射关系，适用于分类和回归任务。典型算法包括线性回归、逻辑回归、SVM、决策树和随机森林。
- **无监督学习（Unsupervised Learning）**：在无标注数据中发现隐含结构，如聚类（K-Means）、降维（PCA）和异常检测。
- **强化学习（Reinforcement Learning）**：智能体通过与环境交互获得奖励信号来优化策略，广泛应用于游戏 AI、机器人控制和推荐系统。

## 特征工程

特征工程是传统 ML 的核心环节。优质特征往往比模型选择更能决定最终效果。关键步骤包括特征提取、特征选择、特征变换（归一化、标准化）和特征构造。自动化特征工程工具（如 Featuretools）正在减少人工介入。

## 模型评估

评估指标的选择取决于任务类型：分类任务常用准确率（Accuracy）、精确率（Precision）、召回率（Recall）、F1 分数和 AUC-ROC；回归任务使用 MSE、MAE 和 R²。交叉验证（Cross-Validation）是防止评估偏差的标准方法。

## 过拟合与正则化

过拟合是模型在训练集上表现优异但在新数据上泛化能力差的现象。常用对策包括 L1/L2 正则化、Dropout、早停（Early Stopping）和数据增强。偏差-方差权衡（Bias-Variance Tradeoff）是理解模型复杂度的核心框架。

## 从传统 ML 到深度学习

随着数据规模增长和计算能力提升，[深度学习](/posts/wiki/topics/deep-learning.html)在图像、语音、自然语言等领域逐步超越了传统 ML 方法。传统 ML 在小数据场景、可解释性要求和资源受限环境中仍有优势。[微调](/posts/wiki/concepts/fine-tuning.html)技术使得预训练大模型能够快速适配特定任务，模糊了传统 ML 与深度学习的边界。

## 相关页面

- [topics/deep-learning](/posts/wiki/topics/deep-learning.html)
- [concepts/fine-tuning](/posts/wiki/concepts/fine-tuning.html)
