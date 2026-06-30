import { css } from "lit";

export const activityShimmerStyles = css`
  :host {
    --activity-row-text: #b8b8b8;
  }

  .shimmer-text {
    --activity-shimmer-base: var(--activity-row-text);
    --activity-shimmer-mid: #eeeeee;
    --activity-shimmer-hot: #ffffff;
    display: inline-block;
    max-width: 100%;
    color: var(--activity-shimmer-base);
    background-image: linear-gradient(
      90deg,
      var(--activity-shimmer-base) 0%,
      var(--activity-shimmer-base) 26%,
      var(--activity-shimmer-mid) 42%,
      var(--activity-shimmer-hot) 50%,
      var(--activity-shimmer-mid) 58%,
      var(--activity-shimmer-base) 74%,
      var(--activity-shimmer-base) 100%
    );
    background-size: 320% 100%;
    background-position: 130% 0;
    background-clip: text;
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    animation: activity-text-shimmer 2.4s linear infinite;
    will-change: background-position;
  }

  @keyframes activity-text-shimmer {
    0% { background-position: 130% 0; }
    100% { background-position: -130% 0; }
  }

  @media (prefers-reduced-motion: reduce) {
    .shimmer-text {
      animation: none;
      background: none;
      -webkit-text-fill-color: currentColor;
      color: var(--activity-shimmer-base);
      will-change: auto;
    }
  }
`;
